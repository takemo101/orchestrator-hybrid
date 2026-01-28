import { describe, expect, mock, test, beforeEach, afterEach, spyOn } from "bun:test";
import {
	type WorktreeInfo,
	WorktreeManager,
	WorktreeCreateError,
	WorktreeRunningError,
	WorktreeNotFoundError,
} from "./worktree";
import type { WorktreeConfig } from "./types";

/**
 * WorktreeManager テスト
 *
 * git worktreeを使用したIssue単位の環境分離機能をテストする。
 */

/** git worktree list --porcelain の出力サンプル */
const PORCELAIN_OUTPUT = `worktree /path/to/repo
HEAD abc123def456
branch refs/heads/main

worktree /path/to/repo/.worktrees/issue-42
HEAD def456abc123
branch refs/heads/feature/issue-42

worktree /path/to/repo/.worktrees/issue-99
HEAD 789xyz
branch refs/heads/feature/issue-99
`;

describe("WorktreeManager", () => {
	describe("create", () => {
		test("新規worktreeを作成する（新規ブランチ）", async () => {
			const execFn = mockExec([
				{ stdout: "worktree /path/to/repo\nHEAD abc\nbranch refs/heads/main\n", stderr: "", exitCode: 0 }, // list (for exists check) - no issue-42
				{ stdout: "", stderr: "", exitCode: 1 }, // rev-parse: branch doesn't exist
				{ stdout: "", stderr: "", exitCode: 0 }, // worktree add
			]);

			const manager = createManager({ exec: execFn });
			const result = await manager.create(42);

			expect(result.issueNumber).toBe(42);
			expect(result.branch).toBe("feature/issue-42");
			expect(result.path).toBe(".worktrees/issue-42");
		});

		test("既存ブランチがある場合、そのブランチでworktreeを作成する", async () => {
			const execFn = mockExec([
				{ stdout: "worktree /path/to/repo\nHEAD abc\nbranch refs/heads/main\n", stderr: "", exitCode: 0 }, // list (for exists check) - no issue-42
				{ stdout: "abc123", stderr: "", exitCode: 0 }, // rev-parse: branch exists
				{ stdout: "", stderr: "", exitCode: 0 }, // worktree add
			]);

			const manager = createManager({ exec: execFn });
			await manager.create(42);

			expect(execFn).toHaveBeenCalledWith([
				"git",
				"worktree",
				"add",
				".worktrees/issue-42",
				"feature/issue-42",
			]);
		});

		test("worktreeが既に存在する場合、既存情報を返す", async () => {
			const execFn = mockExec([
				{ stdout: PORCELAIN_OUTPUT, stderr: "", exitCode: 0 }, // list (for exists check)
			]);

			const manager = createManager({ exec: execFn });
			const result = await manager.create(42);

			expect(result.issueNumber).toBe(42);
			expect(result.branch).toBe("feature/issue-42");
		});

		test("環境ファイルをコピーする", async () => {
			const writeFile = mock(() => Promise.resolve());
			const fileExists = mock(() => Promise.resolve(true));
			const readFile = mock(() => Promise.resolve("content"));

			const execFn = mockExec([
				{ stdout: "worktree /path/to/repo\nHEAD abc\nbranch refs/heads/main\n", stderr: "", exitCode: 0 }, // list (for exists check)
				{ stdout: "", stderr: "", exitCode: 1 }, // rev-parse
				{ stdout: "", stderr: "", exitCode: 0 }, // worktree add
			]);

			const manager = createManager({
				exec: execFn,
				copyFiles: [".env", ".envrc"],
				fileOps: { writeFile, fileExists, readFile },
			});

			await manager.create(42);

			expect(writeFile).toHaveBeenCalledTimes(2);
		});

		test("環境ファイルが存在しない場合はスキップする", async () => {
			const writeFile = mock(() => Promise.resolve());
			const fileExists = mock(() => Promise.resolve(false));
			const readFile = mock(() => Promise.resolve(""));

			const execFn = mockExec([
				{ stdout: "worktree /path/to/repo\nHEAD abc\nbranch refs/heads/main\n", stderr: "", exitCode: 0 }, // list (for exists check)
				{ stdout: "", stderr: "", exitCode: 1 }, // rev-parse
				{ stdout: "", stderr: "", exitCode: 0 }, // worktree add
			]);

			const manager = createManager({
				exec: execFn,
				copyFiles: [".env"],
				fileOps: { writeFile, fileExists, readFile },
			});

			await manager.create(42);

			expect(writeFile).not.toHaveBeenCalled();
		});

		test("git worktree addが失敗した場合WorktreeCreateErrorをスローする", async () => {
			const execFn = mockExec([
				{ stdout: "", stderr: "", exitCode: 1 }, // rev-parse
				{ stdout: "", stderr: "fatal: worktree already exists", exitCode: 128 }, // worktree add fails
			]);

			const manager = createManager({ exec: execFn });

			await expect(manager.create(42)).rejects.toThrow(WorktreeCreateError);
		});
	});

	describe("list", () => {
		test("全worktreeの一覧を取得する", async () => {
			const execFn = mockExec([{ stdout: PORCELAIN_OUTPUT, stderr: "", exitCode: 0 }]);

			const manager = createManager({ exec: execFn });
			const result = await manager.list();

			expect(result).toHaveLength(2); // main worktreeは除外
			expect(result[0].issueNumber).toBe(42);
			expect(result[1].issueNumber).toBe(99);
		});

		test("worktreeがない場合は空配列を返す", async () => {
			const execFn = mockExec([
				{
					stdout: `worktree /path/to/repo
HEAD abc123
branch refs/heads/main
`,
					stderr: "",
					exitCode: 0,
				},
			]);

			const manager = createManager({ exec: execFn });
			const result = await manager.list();

			expect(result).toEqual([]);
		});
	});

	describe("remove", () => {
		test("worktreeを削除する（running以外）", async () => {
			const execFn = mockExec([
				{ stdout: "", stderr: "", exitCode: 0 }, // gh issue view (no orch:running label)
				{ stdout: "", stderr: "", exitCode: 0 }, // worktree remove
				{ stdout: "", stderr: "", exitCode: 0 }, // worktree prune
			]);

			const manager = createManager({ exec: execFn });
			await manager.remove(42);

			expect(execFn).toHaveBeenCalledWith([
				"git",
				"worktree",
				"remove",
				".worktrees/issue-42",
				"--force",
			]);
			expect(execFn).toHaveBeenCalledWith(["git", "worktree", "prune"]);
		});

		test("実行中のworktreeは削除できない（orch:running）", async () => {
			const execFn = mockExec([
				{ stdout: "orch:running\nenhancement", stderr: "", exitCode: 0 }, // gh issue view with orch:running
			]);

			const manager = createManager({ exec: execFn });

			await expect(manager.remove(42)).rejects.toThrow(WorktreeRunningError);
		});

		test("WorktreeRunningErrorにIssue番号が含まれる", async () => {
			const execFn = mockExec([
				{ stdout: "orch:running", stderr: "", exitCode: 0 },
			]);

			const manager = createManager({ exec: execFn });

			try {
				await manager.remove(42);
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(WorktreeRunningError);
				expect((e as WorktreeRunningError).issueNumber).toBe(42);
			}
		});
	});

	describe("exists", () => {
		test("worktreeが存在する場合trueを返す", async () => {
			const execFn = mockExec([{ stdout: PORCELAIN_OUTPUT, stderr: "", exitCode: 0 }]);

			const manager = createManager({ exec: execFn });
			const result = await manager.exists(42);

			expect(result).toBe(true);
		});

		test("worktreeが存在しない場合falseを返す", async () => {
			const execFn = mockExec([{ stdout: PORCELAIN_OUTPUT, stderr: "", exitCode: 0 }]);

			const manager = createManager({ exec: execFn });
			const result = await manager.exists(123);

			expect(result).toBe(false);
		});
	});

	describe("parseWorktreeList", () => {
		test("porcelain出力を正しくパースする", () => {
			const manager = createManager({});
			// @ts-expect-error Testing private method
			const result = manager.parseWorktreeList(PORCELAIN_OUTPUT);

			expect(result).toHaveLength(2);
			expect(result[0]).toEqual({
				issueNumber: 42,
				branch: "feature/issue-42",
				path: "/path/to/repo/.worktrees/issue-42",
				status: "completed",
			});
		});
	});
});

// ============================================================
// ヘルパー
// ============================================================

interface ExecResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

type ExecFn = ReturnType<typeof mockExec>;

interface FileOps {
	writeFile: (path: string, content: string) => Promise<void>;
	fileExists: (path: string) => Promise<boolean>;
	readFile: (path: string) => Promise<string>;
}

interface ManagerOptions {
	exec?: ExecFn;
	copyFiles?: string[];
	baseDir?: string;
	fileOps?: FileOps;
}

function mockExec(results: ExecResult[]) {
	let callIndex = 0;
	return mock((_args: string[]): Promise<ExecResult> => {
		const result = results[callIndex];
		callIndex++;
		return Promise.resolve(result ?? { stdout: "", stderr: "", exitCode: 0 });
	});
}

function createManager(options: ManagerOptions): WorktreeManager {
	const config: WorktreeConfig = {
		enabled: true,
		base_dir: options.baseDir ?? ".worktrees",
		copy_files: options.copyFiles ?? [],
	};

	const exec = options.exec ?? mockExec([]);
	const fileOps = options.fileOps ?? {
		writeFile: mock(() => Promise.resolve()),
		fileExists: mock(() => Promise.resolve(false)),
		readFile: mock(() => Promise.resolve("")),
	};

	return new WorktreeManager(config, exec, fileOps);
}
