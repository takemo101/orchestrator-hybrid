/**
 * SandboxAdapter インターフェース定義のテスト
 * Issue #8: TDD Red Phase - テストを先に作成
 *
 * Note: インターフェースのテストは主に型チェックで行われる。
 * ここではインターフェースの使用例をテストとして記述し、
 * 型が正しく定義されていることを確認する。
 */
import { describe, expect, it } from "bun:test";
import type { ExecuteOptions, ExecuteResult, SandboxAdapter } from "./sandbox-adapter.js";

describe("SandboxAdapter インターフェース", () => {
	describe("ExecuteOptions型", () => {
		it("すべてのプロパティがオプショナル", () => {
			// 空オブジェクトが有効なExecuteOptions
			const options: ExecuteOptions = {};
			expect(options).toEqual({});
		});

		it("cwdプロパティを設定できる", () => {
			const options: ExecuteOptions = {
				cwd: "/path/to/dir",
			};
			expect(options.cwd).toBe("/path/to/dir");
		});

		it("envプロパティを設定できる", () => {
			const options: ExecuteOptions = {
				env: { NODE_ENV: "production", DEBUG: "true" },
			};
			expect(options.env).toEqual({ NODE_ENV: "production", DEBUG: "true" });
		});

		it("timeoutプロパティを設定できる", () => {
			const options: ExecuteOptions = {
				timeout: 30000,
			};
			expect(options.timeout).toBe(30000);
		});

		it("すべてのプロパティを同時に設定できる", () => {
			const options: ExecuteOptions = {
				cwd: "/workspace",
				env: { FOO: "bar" },
				timeout: 60000,
			};
			expect(options.cwd).toBe("/workspace");
			expect(options.env).toEqual({ FOO: "bar" });
			expect(options.timeout).toBe(60000);
		});
	});

	describe("ExecuteResult型", () => {
		it("すべての必須プロパティを持つ", () => {
			const result: ExecuteResult = {
				stdout: "output",
				stderr: "",
				exitCode: 0,
			};
			expect(result.stdout).toBe("output");
			expect(result.stderr).toBe("");
			expect(result.exitCode).toBe(0);
		});

		it("exitCodeが非0の場合も有効", () => {
			const result: ExecuteResult = {
				stdout: "",
				stderr: "error message",
				exitCode: 1,
			};
			expect(result.exitCode).toBe(1);
			expect(result.stderr).toBe("error message");
		});

		it("複数行の出力を持てる", () => {
			const result: ExecuteResult = {
				stdout: "line1\nline2\nline3",
				stderr: "",
				exitCode: 0,
			};
			expect(result.stdout).toContain("\n");
		});
	});

	describe("SandboxAdapter インターフェース", () => {
		it("モック実装がインターフェースを満たす", () => {
			// モックアダプターがインターフェースに適合することを確認
			const mockAdapter: SandboxAdapter = {
				name: "mock",

				async isAvailable(): Promise<boolean> {
					return true;
				},

				async execute(command: string, _options?: ExecuteOptions): Promise<ExecuteResult> {
					void _options; // unused in mock
					return {
						stdout: `executed: ${command}`,
						stderr: "",
						exitCode: 0,
					};
				},

				async cleanup(): Promise<void> {
					// noop
				},
			};

			expect(mockAdapter.name).toBe("mock");
		});

		it("isAvailable()がPromise<boolean>を返す", async () => {
			const mockAdapter: SandboxAdapter = {
				name: "test",
				async isAvailable() {
					return false;
				},
				async execute() {
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				async cleanup() {},
			};

			const result = await mockAdapter.isAvailable();
			expect(typeof result).toBe("boolean");
			expect(result).toBe(false);
		});

		it("execute()がコマンドを受け取り結果を返す", async () => {
			const mockAdapter: SandboxAdapter = {
				name: "test",
				async isAvailable() {
					return true;
				},
				async execute(command: string, _options?: ExecuteOptions) {
					void _options; // unused in mock
					return {
						stdout: `ran: ${command}`,
						stderr: "",
						exitCode: 0,
					};
				},
				async cleanup() {},
			};

			const result = await mockAdapter.execute("echo hello");
			expect(result.stdout).toBe("ran: echo hello");
			expect(result.exitCode).toBe(0);
		});

		it("execute()がオプションを受け取れる", async () => {
			let receivedOptions: ExecuteOptions | undefined;

			const mockAdapter: SandboxAdapter = {
				name: "test",
				async isAvailable() {
					return true;
				},
				async execute(command: string, options?: ExecuteOptions) {
					receivedOptions = options;
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				async cleanup() {},
			};

			await mockAdapter.execute("test", { cwd: "/tmp", timeout: 5000 });
			expect(receivedOptions?.cwd).toBe("/tmp");
			expect(receivedOptions?.timeout).toBe(5000);
		});

		it("cleanup()がPromise<void>を返す", async () => {
			let cleanedUp = false;

			const mockAdapter: SandboxAdapter = {
				name: "test",
				async isAvailable() {
					return true;
				},
				async execute() {
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				async cleanup() {
					cleanedUp = true;
				},
			};

			await mockAdapter.cleanup();
			expect(cleanedUp).toBe(true);
		});

		it("nameプロパティが読み取り専用", () => {
			const mockAdapter: SandboxAdapter = {
				name: "readonly-test",
				async isAvailable() {
					return true;
				},
				async execute() {
					return { stdout: "", stderr: "", exitCode: 0 };
				},
				async cleanup() {},
			};

			// nameプロパティの値を確認
			expect(mockAdapter.name).toBe("readonly-test");
		});
	});
});
