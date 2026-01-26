import { describe, it, expect, mock, beforeEach } from "bun:test";
import { CustomBackend, type CustomBackendConfig } from "./custom-backend.js";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";

describe("CustomBackend", () => {
	let mockExecutor: ProcessExecutor;
	let mockSpawn: ReturnType<typeof mock>;

	beforeEach(() => {
		mockSpawn = mock(() =>
			Promise.resolve({ stdout: "result output", stderr: "", exitCode: 0 }),
		);
		mockExecutor = {
			spawn: mockSpawn,
		};
	});

	describe("constructor", () => {
		it("should create instance with required config", () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);
			expect(backend.name).toBe("custom:my-agent");
		});

		it("should create instance with all config options", () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				args: ["--headless", "--auto-approve"],
				promptMode: "arg",
				promptFlag: "-p",
			};
			const backend = new CustomBackend(config, mockExecutor);
			expect(backend.name).toBe("custom:my-agent");
		});
	});

	describe("execute with promptMode: arg", () => {
		it("should pass prompt as positional argument when no promptFlag", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				promptMode: "arg",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				["test prompt"],
				expect.any(Object),
			);
		});

		it("should pass prompt with flag when promptFlag specified", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				args: ["--headless"],
				promptMode: "arg",
				promptFlag: "-p",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				["--headless", "-p", "test prompt"],
				expect.any(Object),
			);
		});

		it("should include custom args before prompt", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				args: ["--verbose", "--auto"],
				promptMode: "arg",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				["--verbose", "--auto", "test prompt"],
				expect.any(Object),
			);
		});
	});

	describe("execute with promptMode: stdin", () => {
		it("should pass prompt via stdin", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				promptMode: "stdin",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				[],
				expect.objectContaining({ stdin: "test prompt" }),
			);
		});

		it("should include custom args with stdin mode", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				args: ["--verbose"],
				promptMode: "stdin",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				["--verbose"],
				expect.objectContaining({ stdin: "test prompt" }),
			);
		});
	});

	describe("execute default behavior", () => {
		it("should default to arg mode when promptMode not specified", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				["test prompt"],
				expect.any(Object),
			);
		});

		it("should default to empty args when args not specified", async () => {
			const config: CustomBackendConfig = {
				command: "my-agent",
				promptFlag: "-p",
			};
			const backend = new CustomBackend(config, mockExecutor);

			await backend.execute("test prompt");

			expect(mockSpawn).toHaveBeenCalledWith(
				"my-agent",
				["-p", "test prompt"],
				expect.any(Object),
			);
		});
	});

	describe("execute result handling", () => {
		it("should return stdout on success", async () => {
			mockSpawn.mockImplementation(() =>
				Promise.resolve({ stdout: "success output", stderr: "", exitCode: 0 }),
			);
			const config: CustomBackendConfig = {
				command: "my-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);

			const result = await backend.execute("test prompt");

			expect(result.output).toBe("success output");
			expect(result.exitCode).toBe(0);
		});

		it("should return error info on failure", async () => {
			mockSpawn.mockImplementation(() =>
				Promise.resolve({ stdout: "", stderr: "error occurred", exitCode: 1 }),
			);
			const config: CustomBackendConfig = {
				command: "my-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);

			const result = await backend.execute("test prompt");

			expect(result.exitCode).toBe(1);
		});

		it("should handle command not found", async () => {
			mockSpawn.mockImplementation(() =>
				Promise.resolve({
					stdout: "",
					stderr: "command not found",
					exitCode: 127,
				}),
			);
			const config: CustomBackendConfig = {
				command: "nonexistent-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);

			const result = await backend.execute("test prompt");

			expect(result.exitCode).toBe(127);
		});

		it("should handle empty output", async () => {
			mockSpawn.mockImplementation(() =>
				Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }),
			);
			const config: CustomBackendConfig = {
				command: "my-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);

			const result = await backend.execute("test prompt");

			expect(result.output).toBe("");
			expect(result.exitCode).toBe(0);
		});

		it("should handle spawn exception", async () => {
			mockSpawn.mockImplementation(() => Promise.reject(new Error("Spawn failed")));
			const config: CustomBackendConfig = {
				command: "my-agent",
			};
			const backend = new CustomBackend(config, mockExecutor);

			const result = await backend.execute("test prompt");

			expect(result.exitCode).toBe(1);
			expect(result.output).toContain("Spawn failed");
		});
	});
});
