import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { WorktreeManager } from "./worktree-manager";
import type { WorktreeConfig, WorktreeInfo } from "../core/types";
import { WorktreeError } from "../core/errors";

/**
 * WorktreeManager テスト (F-201)
 *
 * git worktreeの作成・削除・一覧管理を行うWorktreeManagerクラスのテストです。
 */

// Mock ProcessExecutor interface
interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

interface MockProcessExecutor {
	execute: (command: string, args: string[]) => Promise<ProcessResult>;
}

describe("WorktreeManager", () => {
	let tempDir: string;
	let worktreesJsonPath: string;
	let mockExecutor: MockProcessExecutor;
	let defaultConfig: WorktreeConfig;

	beforeEach(() => {
		// Create temp directory for tests
		tempDir = fs.mkdtempSync(path.join("/tmp", "worktree-test-"));
		worktreesJsonPath = path.join(tempDir, ".worktrees.json");

		// Default config
		defaultConfig = {
			enabled: true,
			base_dir: ".worktrees",
			auto_cleanup: true,
			copy_env_files: [".env", ".envrc", ".env.local"],
		};

		// Mock executor
		mockExecutor = {
			execute: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
				return { stdout: "", stderr: "", exitCode: 0 };
			}),
		};
	});

	afterEach(() => {
		// Clean up temp directory
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe("createWorktree", () => {
		it("worktreeが無効の場合はnullを返す", async () => {
			const config: WorktreeConfig = { ...defaultConfig, enabled: false };
			const manager = new WorktreeManager(config, tempDir, mockExecutor);

			const result = await manager.createWorktree(42, "host");

			expect(result).toBeNull();
			// git worktree addは呼ばれていないことを確認
			expect(mockExecutor.execute).not.toHaveBeenCalled();
		});

		it("worktreeを正常に作成できる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			const result = await manager.createWorktree(42, "container-use", "env-123");

			expect(result).not.toBeNull();
			expect(result?.issueNumber).toBe(42);
			expect(result?.path).toBe(".worktrees/issue-42");
			expect(result?.branch).toBe("feature/issue-42");
			expect(result?.environmentType).toBe("container-use");
			expect(result?.environmentId).toBe("env-123");
			expect(result?.status).toBe("active");
			expect(result?.createdAt).toBeDefined();

			// git worktree addが呼ばれたことを確認
			expect(mockExecutor.execute).toHaveBeenCalledWith("git", [
				"worktree",
				"add",
				expect.stringContaining(".worktrees/issue-42"),
				"-b",
				"feature/issue-42",
			]);
		});

		it("既存ディレクトリがある場合はエラーをスローする", async () => {
			// Create existing worktree directory
			const worktreeDir = path.join(tempDir, ".worktrees", "issue-42");
			fs.mkdirSync(worktreeDir, { recursive: true });

			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await expect(manager.createWorktree(42, "host")).rejects.toThrow(WorktreeError);
			await expect(manager.createWorktree(42, "host")).rejects.toThrow(
				/worktree .+ は既に存在します/,
			);
		});

		it("git worktree addが失敗した場合はエラーをスローする", async () => {
			mockExecutor.execute = mock(async () => {
				return { stdout: "", stderr: "fatal: branch already exists", exitCode: 128 };
			});

			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await expect(manager.createWorktree(42, "host")).rejects.toThrow(WorktreeError);
			await expect(manager.createWorktree(42, "host")).rejects.toThrow(/worktree作成失敗/);
		});

		it("環境ファイルがコピーされる", async () => {
			// Create .env file in project root
			const envFile = path.join(tempDir, ".env");
			fs.writeFileSync(envFile, "TEST_VAR=123");

			const worktreeDir = path.join(tempDir, ".worktrees", "issue-42");

			// Mock executor that creates the worktree directory (simulating what git worktree add does)
			const copyTestExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
					// Simulate git worktree add creating the directory
					if (args.includes("worktree") && args.includes("add")) {
						fs.mkdirSync(worktreeDir, { recursive: true });
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const manager = new WorktreeManager(defaultConfig, tempDir, copyTestExecutor);

			await manager.createWorktree(42, "host");

			// Check if .env was copied to worktree path
			const copiedEnvFile = path.join(worktreeDir, ".env");
			expect(fs.existsSync(copiedEnvFile)).toBe(true);
			expect(fs.readFileSync(copiedEnvFile, "utf-8")).toBe("TEST_VAR=123");
		});

		it("worktrees.jsonに保存される", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "container-use", "env-123");

			// Read worktrees.json and verify
			expect(fs.existsSync(worktreesJsonPath)).toBe(true);
			const data = JSON.parse(fs.readFileSync(worktreesJsonPath, "utf-8"));
			expect(data.worktrees).toHaveLength(1);
			expect(data.worktrees[0].issueNumber).toBe(42);
		});
	});

	describe("removeWorktree", () => {
		it("存在しないworktreeの削除は何もしない", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			// Should not throw
			await manager.removeWorktree(999);

			// git worktree removeは呼ばれていないことを確認
			expect(mockExecutor.execute).not.toHaveBeenCalled();
		});

		it("worktreeを正常に削除できる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			// First create a worktree
			await manager.createWorktree(42, "host");

			// Reset mock to track only remove calls
			(mockExecutor.execute as ReturnType<typeof mock>).mockClear();

			// Then remove it
			await manager.removeWorktree(42);

			// git worktree removeが呼ばれたことを確認
			expect(mockExecutor.execute).toHaveBeenCalledWith("git", [
				"worktree",
				"remove",
				expect.stringContaining(".worktrees/issue-42"),
				"--force",
			]);
		});

		it("deleteBranch=trueでブランチも削除される", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			// First create a worktree
			await manager.createWorktree(42, "host");

			// Reset mock
			(mockExecutor.execute as ReturnType<typeof mock>).mockClear();

			// Remove with branch deletion
			await manager.removeWorktree(42, true);

			// git branch -dが呼ばれたことを確認
			expect(mockExecutor.execute).toHaveBeenCalledWith("git", [
				"branch",
				"-d",
				"feature/issue-42",
			]);
		});

		it("git worktree removeが失敗した場合はエラーをスローする", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			// First create a worktree
			await manager.createWorktree(42, "host");

			// Make remove fail
			mockExecutor.execute = mock(async (command: string, args: string[]) => {
				if (args.includes("remove")) {
					return { stdout: "", stderr: "error: worktree is dirty", exitCode: 1 };
				}
				return { stdout: "", stderr: "", exitCode: 0 };
			});

			await expect(manager.removeWorktree(42)).rejects.toThrow(WorktreeError);
			await expect(manager.removeWorktree(42)).rejects.toThrow(/worktree削除失敗/);
		});

		it("worktrees.jsonから削除される", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "host");
			await manager.createWorktree(43, "host");

			await manager.removeWorktree(42);

			// Read worktrees.json and verify
			const data = JSON.parse(fs.readFileSync(worktreesJsonPath, "utf-8"));
			expect(data.worktrees).toHaveLength(1);
			expect(data.worktrees[0].issueNumber).toBe(43);
		});
	});

	describe("listWorktrees", () => {
		it("空の場合は空配列を返す", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			const result = await manager.listWorktrees();

			expect(result).toEqual([]);
		});

		it("全てのworktreeを返す", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "host");
			await manager.createWorktree(43, "container-use", "env-456");

			const result = await manager.listWorktrees();

			expect(result).toHaveLength(2);
			expect(result.find((w) => w.issueNumber === 42)).toBeDefined();
			expect(result.find((w) => w.issueNumber === 43)).toBeDefined();
		});
	});

	describe("getWorktree", () => {
		it("存在しないworktreeはnullを返す", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			const result = await manager.getWorktree(999);

			expect(result).toBeNull();
		});

		it("指定したworktreeを返す", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "container-use", "env-123");

			const result = await manager.getWorktree(42);

			expect(result).not.toBeNull();
			expect(result?.issueNumber).toBe(42);
			expect(result?.environmentId).toBe("env-123");
		});
	});

	describe("updateWorktree", () => {
		it("存在しないworktreeの更新はエラーをスローする", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await expect(manager.updateWorktree(999, { status: "merged" })).rejects.toThrow(
				WorktreeError,
			);
			await expect(manager.updateWorktree(999, { status: "merged" })).rejects.toThrow(
				/が見つかりません/,
			);
		});

		it("environmentIdを更新できる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "host");
			await manager.updateWorktree(42, { environmentId: "new-env-123" });

			const result = await manager.getWorktree(42);
			expect(result?.environmentId).toBe("new-env-123");
		});

		it("statusを更新できる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "host");
			await manager.updateWorktree(42, { status: "merged" });

			const result = await manager.getWorktree(42);
			expect(result?.status).toBe("merged");
		});

		it("environmentTypeを更新できる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "host");
			await manager.updateWorktree(42, { environmentType: "container-use" });

			const result = await manager.getWorktree(42);
			expect(result?.environmentType).toBe("container-use");
		});

		it("複数フィールドを同時に更新できる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			await manager.createWorktree(42, "host");
			await manager.updateWorktree(42, {
				environmentId: "env-999",
				environmentType: "docker",
				status: "abandoned",
			});

			const result = await manager.getWorktree(42);
			expect(result?.environmentId).toBe("env-999");
			expect(result?.environmentType).toBe("docker");
			expect(result?.status).toBe("abandoned");
		});
	});

	describe("排他制御 (withLock)", () => {
		it("並列書き込みでも整合性が保たれる", async () => {
			const manager = new WorktreeManager(defaultConfig, tempDir, mockExecutor);

			// Create multiple worktrees in parallel
			await Promise.all([
				manager.createWorktree(42, "host"),
				manager.createWorktree(43, "host"),
				manager.createWorktree(44, "host"),
			]);

			const result = await manager.listWorktrees();

			expect(result).toHaveLength(3);
			expect(result.map((w) => w.issueNumber).sort()).toEqual([42, 43, 44]);
		});
	});
});
