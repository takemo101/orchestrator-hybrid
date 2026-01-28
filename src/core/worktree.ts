import { OrchestratorError } from "./errors";
import type { WorktreeConfig } from "./types";

/**
 * Worktree作成エラー
 */
export class WorktreeCreateError extends OrchestratorError {
	readonly issueNumber: number;

	constructor(issueNumber: number, cause?: Error) {
		super(`Failed to create worktree for issue #${issueNumber}${cause ? `: ${cause.message}` : ""}`);
		this.name = "WorktreeCreateError";
		this.issueNumber = issueNumber;
		this.cause = cause;
	}
}

/**
 * Worktree実行中エラー（削除保護）
 */
export class WorktreeRunningError extends OrchestratorError {
	readonly issueNumber: number;

	constructor(issueNumber: number) {
		super(`Cannot remove worktree: issue #${issueNumber} is currently running`);
		this.name = "WorktreeRunningError";
		this.issueNumber = issueNumber;
	}
}

/**
 * Worktree未発見エラー
 */
export class WorktreeNotFoundError extends OrchestratorError {
	readonly issueNumber: number;

	constructor(issueNumber: number) {
		super(`Worktree for issue #${issueNumber} not found`);
		this.name = "WorktreeNotFoundError";
		this.issueNumber = issueNumber;
	}
}

/**
 * Worktree情報
 */
export interface WorktreeInfo {
	issueNumber: number;
	branch: string;
	path: string;
	status: "running" | "completed";
}

/**
 * プロセス実行関数の型
 */
export type ExecFn = (
	args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * ファイル操作関数の型
 */
export interface FileOps {
	writeFile: (path: string, content: string) => Promise<void>;
	fileExists: (path: string) => Promise<boolean>;
	readFile: (path: string) => Promise<string>;
}

/**
 * git worktreeを使用したIssue単位の環境分離マネージャー
 *
 * - Issue単位でworktreeを作成
 * - 環境ファイル（.env等）の自動コピー
 * - 実行中のworktree削除を防止
 */
export class WorktreeManager {
	private config: WorktreeConfig;
	private exec: ExecFn;
	private fileOps: FileOps;

	constructor(config: WorktreeConfig, exec: ExecFn, fileOps: FileOps) {
		this.config = config;
		this.exec = exec;
		this.fileOps = fileOps;
	}

	/**
	 * 指定されたIssue番号のworktreeを作成する
	 *
	 * @param issueNumber Issue番号
	 * @returns Worktree情報
	 * @throws WorktreeCreateError 作成に失敗した場合
	 */
	async create(issueNumber: number): Promise<WorktreeInfo> {
		const branch = `feature/issue-${issueNumber}`;
		const worktreePath = `${this.config.base_dir}/issue-${issueNumber}`;

		// 既存チェック
		if (await this.exists(issueNumber)) {
			return this.getWorktreeInfo(issueNumber);
		}

		// ブランチ存在チェック
		const branchExists = await this.branchExists(branch);

		try {
			if (branchExists) {
				// 既存ブランチでworktree作成
				await this.exec(["git", "worktree", "add", worktreePath, branch]);
			} else {
				// 新規ブランチでworktree作成
				await this.exec(["git", "worktree", "add", "-b", branch, worktreePath, "main"]);
			}
		} catch (error) {
			throw new WorktreeCreateError(issueNumber, error as Error);
		}

		// 環境ファイルコピー
		await this.copyEnvironmentFiles(worktreePath);

		return {
			issueNumber,
			branch,
			path: worktreePath,
			status: "running",
		};
	}

	/**
	 * 全worktreeの一覧を取得する
	 */
	async list(): Promise<WorktreeInfo[]> {
		const result = await this.exec(["git", "worktree", "list", "--porcelain"]);
		return this.parseWorktreeList(result.stdout);
	}

	/**
	 * 指定されたIssue番号のworktreeを削除する
	 *
	 * @param issueNumber Issue番号
	 * @throws WorktreeRunningError 実行中のworktreeを削除しようとした場合
	 */
	async remove(issueNumber: number): Promise<void> {
		// 実行中チェック
		const isRunning = await this.isIssueRunning(issueNumber);
		if (isRunning) {
			throw new WorktreeRunningError(issueNumber);
		}

		const worktreePath = `${this.config.base_dir}/issue-${issueNumber}`;

		// worktree削除
		await this.exec(["git", "worktree", "remove", worktreePath, "--force"]);

		// プルーニング
		await this.exec(["git", "worktree", "prune"]);
	}

	/**
	 * 指定されたIssue番号のworktreeが存在するか確認する
	 */
	async exists(issueNumber: number): Promise<boolean> {
		const list = await this.list();
		return list.some((wt) => wt.issueNumber === issueNumber);
	}

	// ============================================================
	// Private methods
	// ============================================================

	/**
	 * ブランチが存在するか確認する
	 */
	private async branchExists(branch: string): Promise<boolean> {
		try {
			const result = await this.exec(["git", "rev-parse", "--verify", branch]);
			return result.exitCode === 0;
		} catch {
			return false;
		}
	}

	/**
	 * 環境ファイルをworktreeにコピーする
	 */
	private async copyEnvironmentFiles(targetDir: string): Promise<void> {
		const files = this.config.copy_files;

		for (const file of files) {
			try {
				const exists = await this.fileOps.fileExists(file);
				if (exists) {
					const content = await this.fileOps.readFile(file);
					await this.fileOps.writeFile(`${targetDir}/${file}`, content);
				}
			} catch (error) {
				// コピー失敗は警告のみ（続行可能）
				console.warn(`Warning: Failed to copy ${file}: ${error}`);
			}
		}
	}

	/**
	 * Issueが実行中か確認する（orch:runningラベルをチェック）
	 */
	private async isIssueRunning(issueNumber: number): Promise<boolean> {
		try {
			const result = await this.exec([
				"gh",
				"issue",
				"view",
				String(issueNumber),
				"--json",
				"labels",
				"--jq",
				".labels[].name",
			]);
			return result.stdout.includes("orch:running");
		} catch {
			return false;
		}
	}

	/**
	 * 既存のworktree情報を取得する
	 */
	private async getWorktreeInfo(issueNumber: number): Promise<WorktreeInfo> {
		const list = await this.list();
		const info = list.find((wt) => wt.issueNumber === issueNumber);
		if (!info) {
			throw new WorktreeNotFoundError(issueNumber);
		}
		return info;
	}

	/**
	 * git worktree list --porcelain の出力をパースする
	 */
	parseWorktreeList(output: string): WorktreeInfo[] {
		const worktrees: WorktreeInfo[] = [];
		const blocks = output.split("\n\n").filter(Boolean);

		for (const block of blocks) {
			const lines = block.split("\n");
			const pathLine = lines.find((l) => l.startsWith("worktree "));
			const branchLine = lines.find((l) => l.startsWith("branch "));

			if (!pathLine || !branchLine) continue;

			const path = pathLine.replace("worktree ", "");
			const branch = branchLine.replace("branch refs/heads/", "");

			// .worktrees/issue-XX パターンにマッチするもののみ
			const match = path.match(/issue-(\d+)$/);
			if (!match) continue;

			worktrees.push({
				issueNumber: Number.parseInt(match[1], 10),
				branch,
				path,
				status: "completed", // デフォルト。実際のステータスはラベルで確認
			});
		}

		return worktrees;
	}
}
