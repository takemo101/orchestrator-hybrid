/**
 * HostAdapter テスト
 *
 * ホスト環境で直接コードを実行するアダプターのテスト
 */

import { describe, expect, it, mock, spyOn } from "bun:test";
import { logger } from "../core/logger.js";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import { HostAdapter, type HostAdapterConfig } from "./host-adapter.js";

/**
 * モックProcessExecutorを作成
 */
function createMockExecutor(
	defaultResult: ProcessResult = { stdout: "", stderr: "", exitCode: 0 },
): {
	executor: ProcessExecutor;
	spawnMock: ReturnType<typeof mock>;
} {
	const spawnMock = mock(async (): Promise<ProcessResult> => defaultResult);
	return {
		executor: { spawn: spawnMock },
		spawnMock,
	};
}

describe("HostAdapter", () => {
	describe("constructor", () => {
		it("should set name to 'host'", () => {
			const adapter = new HostAdapter();
			expect(adapter.name).toBe("host");
		});

		it("should accept empty config", () => {
			const adapter = new HostAdapter();
			expect(adapter.name).toBe("host");
		});

		it("should accept config with options", () => {
			const config: HostAdapterConfig = {
				timeout: 60000,
				warnOnStart: false,
			};
			const adapter = new HostAdapter(config);
			expect(adapter.name).toBe("host");
		});
	});

	describe("isAvailable", () => {
		it("should always return true", async () => {
			const adapter = new HostAdapter();
			const available = await adapter.isAvailable();
			expect(available).toBe(true);
		});

		it("should return true regardless of executor", async () => {
			const { executor } = createMockExecutor({ stdout: "", stderr: "error", exitCode: 1 });
			const adapter = new HostAdapter({}, executor);
			const available = await adapter.isAvailable();
			expect(available).toBe(true);
		});
	});

	describe("execute", () => {
		it("should execute command via sh -c", async () => {
			const { executor, spawnMock } = createMockExecutor({
				stdout: "Hello",
				stderr: "",
				exitCode: 0,
			});

			const adapter = new HostAdapter({ warnOnStart: false }, executor);
			const result = await adapter.execute("echo Hello");

			expect(spawnMock).toHaveBeenCalledWith("sh", ["-c", "echo Hello"], expect.anything());
			expect(result.stdout).toBe("Hello");
			expect(result.exitCode).toBe(0);
		});

		it("should pass cwd option to executor", async () => {
			const { executor, spawnMock } = createMockExecutor();

			const adapter = new HostAdapter({ warnOnStart: false }, executor);
			await adapter.execute("echo test", { cwd: "/custom/dir" });

			expect(spawnMock).toHaveBeenCalledWith(
				"sh",
				["-c", "echo test"],
				expect.objectContaining({ cwd: "/custom/dir" }),
			);
		});

		it("should pass env option to executor", async () => {
			const { executor, spawnMock } = createMockExecutor();

			const adapter = new HostAdapter({ warnOnStart: false }, executor);
			await adapter.execute("echo $NODE_ENV", {
				env: { NODE_ENV: "production" },
			});

			expect(spawnMock).toHaveBeenCalledWith(
				"sh",
				["-c", "echo $NODE_ENV"],
				expect.objectContaining({ env: { NODE_ENV: "production" } }),
			);
		});

		it("should use config.timeout as default", async () => {
			const { executor, spawnMock } = createMockExecutor();

			const adapter = new HostAdapter({ timeout: 30000, warnOnStart: false }, executor);
			await adapter.execute("echo test");

			expect(spawnMock).toHaveBeenCalledWith(
				"sh",
				["-c", "echo test"],
				expect.objectContaining({ timeout: 30000 }),
			);
		});

		it("should use options.timeout over config.timeout", async () => {
			const { executor, spawnMock } = createMockExecutor();

			const adapter = new HostAdapter({ timeout: 30000, warnOnStart: false }, executor);
			await adapter.execute("echo test", { timeout: 60000 });

			expect(spawnMock).toHaveBeenCalledWith(
				"sh",
				["-c", "echo test"],
				expect.objectContaining({ timeout: 60000 }),
			);
		});

		it("should return stderr in result", async () => {
			const { executor } = createMockExecutor({
				stdout: "",
				stderr: "error output",
				exitCode: 1,
			});

			const adapter = new HostAdapter({ warnOnStart: false }, executor);
			const result = await adapter.execute("invalid command");

			expect(result.stderr).toBe("error output");
			expect(result.exitCode).toBe(1);
		});
	});

	describe("warning on first execution", () => {
		it("should warn on first execution by default", async () => {
			const { executor } = createMockExecutor();
			const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});

			const adapter = new HostAdapter({}, executor);
			await adapter.execute("echo test");

			expect(warnSpy).toHaveBeenCalled();
			expect(warnSpy.mock.calls[0][0]).toContain("ホスト環境で実行中");

			warnSpy.mockRestore();
		});

		it("should warn only once", async () => {
			const { executor } = createMockExecutor();
			const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});

			const adapter = new HostAdapter({}, executor);
			await adapter.execute("echo test1");
			await adapter.execute("echo test2");
			await adapter.execute("echo test3");

			expect(warnSpy).toHaveBeenCalledTimes(1);

			warnSpy.mockRestore();
		});

		it("should not warn when warnOnStart is false", async () => {
			const { executor } = createMockExecutor();
			const warnSpy = spyOn(logger, "warn").mockImplementation(() => {});

			const adapter = new HostAdapter({ warnOnStart: false }, executor);
			await adapter.execute("echo test");

			expect(warnSpy).not.toHaveBeenCalled();

			warnSpy.mockRestore();
		});
	});

	describe("cleanup", () => {
		it("should be a no-op", async () => {
			const adapter = new HostAdapter();

			// Should not throw
			await expect(adapter.cleanup()).resolves.toBeUndefined();
		});

		it("should be callable multiple times", async () => {
			const adapter = new HostAdapter();

			await adapter.cleanup();
			await adapter.cleanup();
			await adapter.cleanup();

			// Should not throw
		});
	});
});
