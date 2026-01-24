import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BunProcessExecutor } from "./bun-process-executor.js";

describe("BunProcessExecutor", () => {
	const executor = new BunProcessExecutor();
	const testDir = ".test-executor";

	beforeEach(async () => {
		await mkdir(testDir, { recursive: true });
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	describe("spawn", () => {
		test("should execute a simple command", async () => {
			const result = await executor.spawn("echo", ["hello"]);

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("hello");
			expect(result.stderr).toBe("");
		});

		test("should return exit code for failed commands", async () => {
			const result = await executor.spawn("sh", ["-c", "exit 42"]);

			expect(result.exitCode).toBe(42);
		});

		test("should capture stderr", async () => {
			const result = await executor.spawn("sh", ["-c", "echo error >&2"]);

			expect(result.exitCode).toBe(0);
			expect(result.stderr.trim()).toBe("error");
		});

		test("should use custom working directory", async () => {
			const result = await executor.spawn("pwd", [], {
				cwd: testDir,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toContain(testDir);
		});

		test("should pass environment variables", async () => {
			const result = await executor.spawn("sh", ["-c", "echo $TEST_VAR"], {
				env: { TEST_VAR: "test_value" },
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("test_value");
		});
	});

	describe("stdin", () => {
		test("should write to stdin", async () => {
			const result = await executor.spawn("cat", [], {
				stdin: "hello from stdin",
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe("hello from stdin");
		});

		test("should handle multi-line stdin", async () => {
			const input = "line1\nline2\nline3";
			const result = await executor.spawn("cat", [], {
				stdin: input,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe(input);
		});
	});

	describe("timeout", () => {
		test("should respect timeout and kill process", async () => {
			const start = Date.now();
			const result = await executor.spawn("sleep", ["10"], {
				timeout: 100,
			});
			const elapsed = Date.now() - start;

			// Process should be killed due to timeout
			expect(elapsed).toBeLessThan(1000);
			// Exit code is non-zero when killed (SIGTERM = 143 on most systems)
			expect(result.exitCode).not.toBe(0);
		});

		test("should complete before timeout", async () => {
			const result = await executor.spawn("echo", ["quick"], {
				timeout: 5000,
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout.trim()).toBe("quick");
		});
	});

	describe("inherit mode", () => {
		test("should return empty string for stdout when inherited", async () => {
			const result = await executor.spawn("echo", ["test"], {
				stdout: "inherit",
			});

			expect(result.exitCode).toBe(0);
			expect(result.stdout).toBe("");
		});

		test("should return empty string for stderr when inherited", async () => {
			const result = await executor.spawn("sh", ["-c", "echo error >&2"], {
				stderr: "inherit",
			});

			expect(result.exitCode).toBe(0);
			expect(result.stderr).toBe("");
		});
	});

	describe("error handling", () => {
		test("should handle command not found", async () => {
			// Command not found results in non-zero exit code, not exception
			const result = await executor.spawn("nonexistent-command-xyz", []);

			expect(result.exitCode).not.toBe(0);
		});
	});
});
