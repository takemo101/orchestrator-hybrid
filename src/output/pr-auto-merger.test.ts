import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { PRAutoMergeError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import { PRAutoMerger, type PRAutoMergerConfig } from "./pr-auto-merger.js";

/**
 * PRAutoMerger 単体テスト
 *
 * テストケース:
 * - UT-F009-001: CI成功時にマージする
 * - UT-F009-002: CI失敗時にエラーをスローする
 * - UT-F009-003: auto_merge無効時はfalseを返す
 * - UT-F009-004: deleteBranch=falseの場合、--delete-branchなしでマージ
 * - UT-F009-005: mergeMethodがrebaseの場合、--rebaseでマージ
 * - UT-F009-006: mergeMethodがmergeの場合、--mergeでマージ
 * - UT-F009-007: マージ失敗時にエラーをスローする
 * - UT-F009-008: タイムアウト時にエラーをスローする
 */
describe("PRAutoMerger", () => {
	let mockExecutor: ProcessExecutor;
	let defaultConfig: PRAutoMergerConfig;
	let spawnMock: ReturnType<typeof mock>;

	beforeEach(() => {
		spawnMock = mock(() => Promise.resolve({ stdout: "[]", stderr: "", exitCode: 0 }));
		mockExecutor = {
			spawn: spawnMock,
		};

		defaultConfig = {
			enabled: true,
			merge_method: "squash",
			delete_branch: true,
			ci_timeout_secs: 600,
		};

		// loggerをモック化してテスト出力を抑制
		spyOn(logger, "info").mockImplementation(() => {});
		spyOn(logger, "success").mockImplementation(() => {});
	});

	const mockHasCIWithChecks = () => {
		spawnMock.mockImplementation((cmd: string, args: string[]) => {
			if (args.includes("--json")) {
				return Promise.resolve({
					stdout: '[{"name": "test"}]',
					stderr: "",
					exitCode: 0,
				});
			}
			return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
		});
	};

	const mockHasCIWithoutChecks = () => {
		spawnMock.mockImplementation((cmd: string, args: string[]) => {
			if (args.includes("--json")) {
				return Promise.resolve({ stdout: "[]", stderr: "", exitCode: 0 });
			}
			return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
		});
	};

	describe("autoMerge", () => {
		it("UT-F009-001: CI成功時にマージする", async () => {
			mockHasCIWithChecks();
			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			const result = await merger.autoMerge(123);

			expect(result).toBe(true);
			expect(spawnMock).toHaveBeenCalledTimes(3);
			// 1回目: gh pr checks --json (hasCI)
			expect(spawnMock).toHaveBeenNthCalledWith(1, "gh", ["pr", "checks", "123", "--json", "name"]);
			// 2回目: gh pr checks --watch
			expect(spawnMock).toHaveBeenNthCalledWith(2, "gh", ["pr", "checks", "123", "--watch"], {
				timeout: 600000,
			});
			// 3回目: gh pr merge
			expect(spawnMock).toHaveBeenNthCalledWith(3, "gh", [
				"pr",
				"merge",
				"123",
				"--squash",
				"--delete-branch",
			]);
		});

		it("UT-F009-002: CI失敗時にエラーをスローする", async () => {
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				if (args.includes("--json")) {
					return Promise.resolve({
						stdout: '[{"name": "test"}]',
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "CI failed", exitCode: 1 });
			});

			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			await expect(merger.autoMerge(123)).rejects.toThrow(PRAutoMergeError);
			await expect(merger.autoMerge(123)).rejects.toThrow("CI失敗");
		});

		it("UT-F009-003: auto_merge無効時はfalseを返す", async () => {
			const disabledConfig = { ...defaultConfig, enabled: false };
			const merger = new PRAutoMerger(disabledConfig, mockExecutor);

			const result = await merger.autoMerge(123);

			expect(result).toBe(false);
			expect(spawnMock).not.toHaveBeenCalled();
		});

		it("UT-F009-004: delete_branch=falseの場合、--delete-branchなしでマージ", async () => {
			mockHasCIWithChecks();
			const noBranchDeleteConfig = { ...defaultConfig, delete_branch: false };
			const merger = new PRAutoMerger(noBranchDeleteConfig, mockExecutor);

			await merger.autoMerge(123);

			expect(spawnMock).toHaveBeenNthCalledWith(3, "gh", ["pr", "merge", "123", "--squash"]);
		});

		it("UT-F009-005: merge_methodがrebaseの場合、--rebaseでマージ", async () => {
			mockHasCIWithChecks();
			const rebaseConfig = { ...defaultConfig, merge_method: "rebase" as const };
			const merger = new PRAutoMerger(rebaseConfig, mockExecutor);

			await merger.autoMerge(123);

			expect(spawnMock).toHaveBeenNthCalledWith(3, "gh", [
				"pr",
				"merge",
				"123",
				"--rebase",
				"--delete-branch",
			]);
		});

		it("UT-F009-006: merge_methodがmergeの場合、--mergeでマージ", async () => {
			mockHasCIWithChecks();
			const mergeConfig = { ...defaultConfig, merge_method: "merge" as const };
			const merger = new PRAutoMerger(mergeConfig, mockExecutor);

			await merger.autoMerge(123);

			expect(spawnMock).toHaveBeenNthCalledWith(3, "gh", [
				"pr",
				"merge",
				"123",
				"--merge",
				"--delete-branch",
			]);
		});

		it("UT-F009-007: マージ失敗時にエラーをスローする", async () => {
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				if (args.includes("--json")) {
					return Promise.resolve({
						stdout: '[{"name": "test"}]',
						stderr: "",
						exitCode: 0,
					});
				}
				if (args.includes("--watch")) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({
					stdout: "",
					stderr: "merge conflict",
					exitCode: 1,
				});
			});

			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			try {
				await merger.autoMerge(123);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PRAutoMergeError);
				expect((error as PRAutoMergeError).message).toContain("マージに失敗");
			}
		});

		it("UT-F009-008: タイムアウト時にエラーをスローする", async () => {
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				if (args.includes("--json")) {
					return Promise.resolve({
						stdout: '[{"name": "test"}]',
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "operation timed out", exitCode: 1 });
			});

			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			await expect(merger.autoMerge(123)).rejects.toThrow(PRAutoMergeError);
			await expect(merger.autoMerge(123)).rejects.toThrow("タイムアウト");
		});

		it("UT-F009-009: CIチェックがない場合はマージを続行する", async () => {
			mockHasCIWithoutChecks();
			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			const result = await merger.autoMerge(123);

			expect(result).toBe(true);
			expect(spawnMock).toHaveBeenCalledTimes(2);
			expect(spawnMock).toHaveBeenNthCalledWith(1, "gh", ["pr", "checks", "123", "--json", "name"]);
			expect(spawnMock).toHaveBeenNthCalledWith(2, "gh", [
				"pr",
				"merge",
				"123",
				"--squash",
				"--delete-branch",
			]);
		});
	});

	describe("config validation", () => {
		it("異なるCIタイムアウト値でspawnに正しいtimeoutが渡される", async () => {
			mockHasCIWithChecks();
			const customTimeoutConfig = { ...defaultConfig, ci_timeout_secs: 300 };
			const merger = new PRAutoMerger(customTimeoutConfig, mockExecutor);

			await merger.autoMerge(123);

			expect(spawnMock).toHaveBeenNthCalledWith(2, "gh", ["pr", "checks", "123", "--watch"], {
				timeout: 300000,
			});
		});

		it("PR番号が正しく文字列に変換される", async () => {
			mockHasCIWithChecks();
			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			await merger.autoMerge(9999);

			expect(spawnMock).toHaveBeenNthCalledWith(2, "gh", ["pr", "checks", "9999", "--watch"], {
				timeout: 600000,
			});
		});
	});

	describe("error details", () => {
		it("CI失敗時のエラーにprNumberが含まれる", async () => {
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				if (args.includes("--json")) {
					return Promise.resolve({
						stdout: '[{"name": "test"}]',
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "checks failed", exitCode: 1 });
			});

			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			try {
				await merger.autoMerge(42);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PRAutoMergeError);
				expect((error as PRAutoMergeError).details).toEqual({ prNumber: 42 });
			}
		});

		it("マージ失敗時のエラーにstderrが含まれる", async () => {
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				if (args.includes("--json")) {
					return Promise.resolve({
						stdout: '[{"name": "test"}]',
						stderr: "",
						exitCode: 0,
					});
				}
				if (args.includes("--watch")) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({
					stdout: "",
					stderr: "cannot merge: conflict",
					exitCode: 1,
				});
			});

			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			try {
				await merger.autoMerge(42);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PRAutoMergeError);
				expect((error as PRAutoMergeError).details).toEqual({
					prNumber: 42,
					stderr: "cannot merge: conflict",
				});
			}
		});

		it("タイムアウト時のエラーにtimeoutが含まれる", async () => {
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				if (args.includes("--json")) {
					return Promise.resolve({
						stdout: '[{"name": "test"}]',
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "timeout reached", exitCode: 1 });
			});

			const merger = new PRAutoMerger(defaultConfig, mockExecutor);

			try {
				await merger.autoMerge(42);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(PRAutoMergeError);
				expect((error as PRAutoMergeError).details).toEqual({
					prNumber: 42,
					timeout: 600,
				});
			}
		});
	});
});
