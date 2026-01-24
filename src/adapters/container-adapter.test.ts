/**
 * ContainerAdapter テスト
 *
 * container-use環境でコードを実行するアダプターのテスト
 */

import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { logger } from "../core/logger.js";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import { ContainerAdapter, type ContainerAdapterConfig } from "./container-adapter.js";

/**
 * モックProcessExecutorを作成
 */
function createMockExecutor(responses: Map<string, ProcessResult>): ProcessExecutor {
	return {
		spawn: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
			const key = `${command} ${args.join(" ")}`;

			// 部分一致で検索
			for (const [pattern, result] of responses.entries()) {
				if (key.includes(pattern)) {
					return result;
				}
			}

			// デフォルトは成功
			return { stdout: "", stderr: "", exitCode: 0 };
		}),
	};
}

describe("ContainerAdapter", () => {
	describe("constructor", () => {
		it("should set name to 'container-use'", () => {
			const adapter = new ContainerAdapter();
			expect(adapter.name).toBe("container-use");
		});

		it("should accept empty config", () => {
			const adapter = new ContainerAdapter();
			expect(adapter.getEnvironmentId()).toBeNull();
		});

		it("should use envId from config", () => {
			const adapter = new ContainerAdapter({ envId: "existing-env-id" });
			expect(adapter.getEnvironmentId()).toBe("existing-env-id");
		});

		it("should accept full config", () => {
			const config: ContainerAdapterConfig = {
				image: "node:20",
				workdir: "/custom/dir",
				envId: "test-env",
			};
			const adapter = new ContainerAdapter(config);
			expect(adapter.getEnvironmentId()).toBe("test-env");
		});
	});

	describe("isAvailable", () => {
		it("should return true when cu is available", async () => {
			const executor = createMockExecutor(
				new Map([["cu --version", { stdout: "container-use v1.0.0", stderr: "", exitCode: 0 }]]),
			);

			const adapter = new ContainerAdapter({}, executor);
			const available = await adapter.isAvailable();

			expect(available).toBe(true);
		});

		it("should return false when cu is not available", async () => {
			const executor = createMockExecutor(
				new Map([["cu --version", { stdout: "", stderr: "command not found", exitCode: 127 }]]),
			);

			const adapter = new ContainerAdapter({}, executor);
			const available = await adapter.isAvailable();

			expect(available).toBe(false);
		});

		it("should return false when spawn throws", async () => {
			const executor: ProcessExecutor = {
				spawn: mock(async () => {
					throw new Error("spawn failed");
				}),
			};

			const adapter = new ContainerAdapter({}, executor);
			const available = await adapter.isAvailable();

			expect(available).toBe(false);
		});
	});

	describe("execute", () => {
		it("should create environment if not exists", async () => {
			const spawnCalls: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					const key = `${command} ${args.join(" ")}`;
					spawnCalls.push(key);

					if (key.includes("environment create")) {
						return {
							stdout: JSON.stringify({ environment_id: "new-env-123" }),
							stderr: "",
							exitCode: 0,
						};
					}
					if (key.includes("environment run")) {
						return { stdout: "Output", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new ContainerAdapter({ workdir: "/test/dir" }, executor);
			await adapter.execute("echo test");

			expect(spawnCalls.some((c) => c.includes("environment create"))).toBe(true);
			expect(adapter.getEnvironmentId()).toBe("new-env-123");
		});

		it("should skip environment creation if envId is provided", async () => {
			const spawnCalls: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					const key = `${command} ${args.join(" ")}`;
					spawnCalls.push(key);
					return { stdout: "Output", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new ContainerAdapter({ envId: "existing-env" }, executor);
			await adapter.execute("echo test");

			expect(spawnCalls.some((c) => c.includes("environment create"))).toBe(false);
			expect(spawnCalls.some((c) => c.includes("environment run"))).toBe(true);
		});

		it("should run command in container", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args.includes("run")) {
						runArgs = args;
					}
					return { stdout: "Command output", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new ContainerAdapter({ envId: "test-env", workdir: "/test/dir" }, executor);
			const result = await adapter.execute("npm test");

			expect(runArgs).toContain("--command");
			expect(runArgs).toContain("npm test");
			expect(result.stdout).toBe("Command output");
			expect(result.exitCode).toBe(0);
		});

		it("should pass timeout option", async () => {
			let spawnOptions: { timeout?: number } = {};
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[], options?: { timeout?: number }) => {
					if (args.includes("run")) {
						spawnOptions = options ?? {};
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new ContainerAdapter({ envId: "test-env" }, executor);
			await adapter.execute("echo test", { timeout: 30000 });

			expect(spawnOptions.timeout).toBe(30000);
		});

		it("should return stderr and exitCode", async () => {
			const executor = createMockExecutor(
				new Map([["environment run", { stdout: "", stderr: "error output", exitCode: 1 }]]),
			);

			const adapter = new ContainerAdapter({ envId: "test-env" }, executor);
			const result = await adapter.execute("failing command");

			expect(result.stderr).toBe("error output");
			expect(result.exitCode).toBe(1);
		});

		it("should throw when environment creation fails", async () => {
			const executor = createMockExecutor(
				new Map([["environment create", { stdout: "", stderr: "creation failed", exitCode: 1 }]]),
			);

			const adapter = new ContainerAdapter({ workdir: "/test" }, executor);

			await expect(adapter.execute("echo test")).rejects.toThrow("環境作成に失敗");
		});
	});

	describe("cleanup", () => {
		it("should delete environment", async () => {
			const spawnCalls: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					const key = `${command} ${args.join(" ")}`;
					spawnCalls.push(key);
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new ContainerAdapter({ envId: "test-env", workdir: "/test" }, executor);
			await adapter.cleanup();

			expect(spawnCalls.some((c) => c.includes("environment delete"))).toBe(true);
			expect(spawnCalls.some((c) => c.includes("test-env"))).toBe(true);
		});

		it("should reset envId after cleanup", async () => {
			const executor = createMockExecutor(new Map());

			const adapter = new ContainerAdapter({ envId: "test-env" }, executor);
			expect(adapter.getEnvironmentId()).toBe("test-env");

			await adapter.cleanup();

			expect(adapter.getEnvironmentId()).toBeNull();
		});

		it("should do nothing if no envId", async () => {
			const spawnMock = mock(async () => ({ stdout: "", stderr: "", exitCode: 0 }));
			const executor: ProcessExecutor = { spawn: spawnMock };

			const adapter = new ContainerAdapter({}, executor);
			await adapter.cleanup();

			expect(spawnMock).not.toHaveBeenCalled();
		});

		it("should not throw when delete fails", async () => {
			const executor = createMockExecutor(
				new Map([["environment delete", { stdout: "", stderr: "delete failed", exitCode: 1 }]]),
			);

			const adapter = new ContainerAdapter({ envId: "test-env", workdir: "/test" }, executor);

			// Should not throw
			await expect(adapter.cleanup()).resolves.toBeUndefined();
		});

		it("should log warning when delete fails", async () => {
			const executor = createMockExecutor(
				new Map([["environment delete", { stdout: "", stderr: "delete failed", exitCode: 1 }]]),
			);
			const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});

			const adapter = new ContainerAdapter({ envId: "test-env", workdir: "/test" }, executor);
			await adapter.cleanup();

			expect(warnSpy).toHaveBeenCalled();

			warnSpy.mockRestore();
		});
	});

	describe("getEnvironmentId", () => {
		it("should return null initially", () => {
			const adapter = new ContainerAdapter();
			expect(adapter.getEnvironmentId()).toBeNull();
		});

		it("should return envId from config", () => {
			const adapter = new ContainerAdapter({ envId: "config-env" });
			expect(adapter.getEnvironmentId()).toBe("config-env");
		});

		it("should return created envId after execute", async () => {
			const executor = createMockExecutor(
				new Map([
					[
						"environment create",
						{
							stdout: JSON.stringify({ environment_id: "created-env" }),
							stderr: "",
							exitCode: 0,
						},
					],
				]),
			);

			const adapter = new ContainerAdapter({ workdir: "/test" }, executor);
			expect(adapter.getEnvironmentId()).toBeNull();

			await adapter.execute("echo test");

			expect(adapter.getEnvironmentId()).toBe("created-env");
		});
	});

	describe("SandboxAdapter interface", () => {
		it("should implement all required properties", () => {
			const adapter = new ContainerAdapter();

			expect(adapter).toHaveProperty("name");
			expect(adapter).toHaveProperty("isAvailable");
			expect(adapter).toHaveProperty("execute");
			expect(adapter).toHaveProperty("cleanup");
		});

		it("should be usable as SandboxAdapter", async () => {
			const executor = createMockExecutor(new Map());

			// Type check: can be assigned to SandboxAdapter
			const adapter: { name: string; isAvailable: () => Promise<boolean> } = new ContainerAdapter(
				{},
				executor,
			);

			expect(adapter.name).toBe("container-use");
		});
	});
});
