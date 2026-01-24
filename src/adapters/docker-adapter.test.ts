/**
 * DockerAdapter テスト
 *
 * Docker環境でコードを実行するアダプターのテスト
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import { ImagePullError } from "../core/errors.js";
import { DockerAdapter, type DockerAdapterConfig } from "./docker-adapter.js";

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

describe("DockerAdapter", () => {
	describe("constructor", () => {
		it("should set name to 'docker'", () => {
			const adapter = new DockerAdapter({ image: "node:20-alpine" });
			expect(adapter.name).toBe("docker");
		});

		it("should use provided config", () => {
			const config: DockerAdapterConfig = {
				image: "node:20-alpine",
				workdir: "/custom/workdir",
				network: "none",
				timeout: 60000,
			};
			const adapter = new DockerAdapter(config);
			expect(adapter.name).toBe("docker");
		});
	});

	describe("isAvailable", () => {
		it("should return true when docker is available", async () => {
			const executor = createMockExecutor(
				new Map([["docker --version", { stdout: "Docker version 24.0.0", stderr: "", exitCode: 0 }]]),
			);

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			const available = await adapter.isAvailable();

			expect(available).toBe(true);
		});

		it("should return false when docker is not available", async () => {
			const executor = createMockExecutor(
				new Map([["docker --version", { stdout: "", stderr: "command not found", exitCode: 127 }]]),
			);

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			const available = await adapter.isAvailable();

			expect(available).toBe(false);
		});

		it("should return false when spawn throws", async () => {
			const executor: ProcessExecutor = {
				spawn: mock(async () => {
					throw new Error("spawn failed");
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			const available = await adapter.isAvailable();

			expect(available).toBe(false);
		});
	});

	describe("execute", () => {
		it("should execute command in docker container", async () => {
			const executor = createMockExecutor(
				new Map([
					["docker image inspect", { stdout: "[{}]", stderr: "", exitCode: 0 }],
					["docker run", { stdout: "Hello from Docker", stderr: "", exitCode: 0 }],
				]),
			);

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			const result = await adapter.execute("echo 'Hello from Docker'");

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe("Hello from Docker");
		});

		it("should pull image if not present", async () => {
			const spawnCalls: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					const key = `${command} ${args.join(" ")}`;
					spawnCalls.push(key);

					if (key.includes("docker image inspect")) {
						return { stdout: "", stderr: "No such image", exitCode: 1 };
					}
					if (key.includes("docker pull")) {
						return { stdout: "Pulled", stderr: "", exitCode: 0 };
					}
					if (key.includes("docker run")) {
						return { stdout: "Output", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			await adapter.execute("echo test");

			expect(spawnCalls.some((c) => c.includes("docker pull"))).toBe(true);
		});

		it("should throw ImagePullError when pull fails", async () => {
			const executor = createMockExecutor(
				new Map([
					["docker image inspect", { stdout: "", stderr: "No such image", exitCode: 1 }],
					["docker pull", { stdout: "", stderr: "pull access denied", exitCode: 1 }],
				]),
			);

			const adapter = new DockerAdapter({ image: "nonexistent:image" }, executor);

			await expect(adapter.execute("echo test")).rejects.toThrow(ImagePullError);
		});

		it("should use --rm flag for auto-cleanup", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			await adapter.execute("echo test");

			expect(runArgs).toContain("--rm");
		});

		it("should apply network setting", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine", network: "none" }, executor);
			await adapter.execute("echo test");

			expect(runArgs).toContain("--network");
			expect(runArgs).toContain("none");
		});

		it("should mount workdir", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine", workdir: "/test/dir" }, executor);
			await adapter.execute("echo test");

			expect(runArgs).toContain("-v");
			const volumeIndex = runArgs.indexOf("-v");
			expect(runArgs[volumeIndex + 1]).toContain("/test/dir");
		});

		it("should pass environment variables", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			await adapter.execute("echo test", {
				env: { NODE_ENV: "production", DEBUG: "true" },
			});

			expect(runArgs).toContain("-e");
			expect(runArgs.some((arg) => arg.includes("NODE_ENV=production"))).toBe(true);
			expect(runArgs.some((arg) => arg.includes("DEBUG=true"))).toBe(true);
		});

		it("should use options.cwd over config.workdir", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine", workdir: "/config/dir" }, executor);
			await adapter.execute("echo test", { cwd: "/options/dir" });

			const volumeIndex = runArgs.indexOf("-v");
			expect(runArgs[volumeIndex + 1]).toContain("/options/dir");
		});

		it("should pass timeout to executor", async () => {
			let spawnOptions: { timeout?: number } = {};
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[], options?: { timeout?: number }) => {
					if (args[0] === "run") {
						spawnOptions = options ?? {};
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine", timeout: 30000 }, executor);
			await adapter.execute("echo test");

			expect(spawnOptions.timeout).toBe(30000);
		});

		it("should use options.timeout over config.timeout", async () => {
			let spawnOptions: { timeout?: number } = {};
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[], options?: { timeout?: number }) => {
					if (args[0] === "run") {
						spawnOptions = options ?? {};
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine", timeout: 30000 }, executor);
			await adapter.execute("echo test", { timeout: 60000 });

			expect(spawnOptions.timeout).toBe(60000);
		});
	});

	describe("cleanup", () => {
		it("should be a no-op (docker uses --rm)", async () => {
			const adapter = new DockerAdapter({ image: "node:20-alpine" });

			// Should not throw
			await expect(adapter.cleanup()).resolves.toBeUndefined();
		});
	});

	describe("buildDockerRunArgs", () => {
		it("should use sh -c to run command", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			await adapter.execute("npm test && npm run build");

			expect(runArgs).toContain("sh");
			expect(runArgs).toContain("-c");
			expect(runArgs).toContain("npm test && npm run build");
		});

		it("should include -i flag for interactive mode", async () => {
			let runArgs: string[] = [];
			const executor: ProcessExecutor = {
				spawn: mock(async (command: string, args: string[]) => {
					if (args[0] === "run") {
						runArgs = args;
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const adapter = new DockerAdapter({ image: "node:20-alpine" }, executor);
			await adapter.execute("echo test");

			expect(runArgs).toContain("-i");
		});
	});
});
