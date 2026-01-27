/**
 * WorktreeManager (F-201)
 *
 * git worktreeの作成・削除・一覧管理を行うクラス。
 * 同一リポジトリの複数ブランチを別ディレクトリで管理し、
 * ファイルシステムレベルで完全に分離された並列実行環境を実現します。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import lockfile from "proper-lockfile";
import { WorktreeError } from "../core/errors";
import type {
	WorktreeConfig,
	WorktreeEnvironmentType,
	WorktreeInfo,
	WorktreesData,
} from "../core/types";

/**
 * プロセス実行結果
 */
export interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

/**
 * プロセス実行インターフェース（DI用）
 */
export interface ProcessExecutor {
	execute(command: string, args: string[]): Promise<ProcessResult>;
}

/**
 * デフォルトのプロセス実行器
 */
export class BunProcessExecutor implements ProcessExecutor {
	async execute(command: string, args: string[]): Promise<ProcessResult> {
		const proc = Bun.spawn([command, ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});

		const stdout = await new Response(proc.stdout).text();
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		return { stdout, stderr, exitCode };
	}
}

/**
 * WorktreeManager - git worktree管理クラス
 */
export class WorktreeManager {
	private readonly config: WorktreeConfig;
	private readonly projectRoot: string;
	private readonly executor: ProcessExecutor;
	private readonly worktreesFilePath: string;

	/**
	 * コンストラクタ
	 * @param config - Worktree設定
	 * @param projectRoot - プロジェクトルートパス
	 * @param executor - プロセス実行器（DI用）
	 */
	constructor(config: WorktreeConfig, projectRoot: string, executor?: ProcessExecutor) {
		this.config = config;
		this.projectRoot = projectRoot;
		this.executor = executor ?? new BunProcessExecutor();
		this.worktreesFilePath = path.join(projectRoot, ".worktrees.json");
	}

	/**
	 * worktreeのパスを生成
	 */
	private getWorktreePath(issueNumber: number): string {
		return path.join(this.projectRoot, this.config.base_dir, `issue-${issueNumber}`);
	}

	/**
	 * worktreeの相対パスを生成
	 */
	private getWorktreeRelativePath(issueNumber: number): string {
		return `${this.config.base_dir}/issue-${issueNumber}`;
	}

	/**
	 * ブランチ名を生成
	 */
	private getBranchName(issueNumber: number): string {
		return `feature/issue-${issueNumber}`;
	}

	/**
	 * worktrees.jsonを読み込む
	 */
	private async loadWorktreesData(): Promise<WorktreesData> {
		if (!fs.existsSync(this.worktreesFilePath)) {
			return { worktrees: [] };
		}
		const content = fs.readFileSync(this.worktreesFilePath, "utf-8");
		return JSON.parse(content) as WorktreesData;
	}

	/**
	 * worktrees.jsonを保存
	 */
	private async saveWorktreesData(data: WorktreesData): Promise<void> {
		fs.writeFileSync(this.worktreesFilePath, JSON.stringify(data, null, 2));
	}

	/**
	 * ファイルロックを使った排他制御
	 */
	private async withLock<T>(fn: () => Promise<T>): Promise<T> {
		// Ensure the file exists before locking
		if (!fs.existsSync(this.worktreesFilePath)) {
			await this.saveWorktreesData({ worktrees: [] });
		}

		let release: (() => Promise<void>) | undefined;
		try {
			release = await lockfile.lock(this.worktreesFilePath, {
				retries: {
					retries: 5,
					minTimeout: 100,
					maxTimeout: 1000,
				},
			});
			return await fn();
		} finally {
			if (release) {
				await release();
			}
		}
	}

	/**
	 * 環境ファイルをworktreeにコピー
	 */
	private async copyEnvFiles(worktreePath: string): Promise<void> {
		for (const envFile of this.config.copy_env_files) {
			const sourcePath = path.join(this.projectRoot, envFile);
			const destPath = path.join(worktreePath, envFile);

			if (fs.existsSync(sourcePath)) {
				fs.copyFileSync(sourcePath, destPath);
			}
		}
	}

	/**
	 * worktreeを作成
	 *
	 * @param issueNumber - Issue番号
	 * @param environmentType - 実行環境タイプ
	 * @param environmentId - 環境ID（オプション）
	 * @returns WorktreeInfo（無効時はnull）
	 * @throws WorktreeError - 作成失敗時
	 */
	async createWorktree(
		issueNumber: number,
		environmentType: WorktreeEnvironmentType,
		environmentId?: string | null,
	): Promise<WorktreeInfo | null> {
		// worktreeが無効の場合は何もしない
		if (!this.config.enabled) {
			return null;
		}

		const worktreePath = this.getWorktreePath(issueNumber);
		const worktreeRelativePath = this.getWorktreeRelativePath(issueNumber);
		const branchName = this.getBranchName(issueNumber);

		// 既存ディレクトリチェック
		if (fs.existsSync(worktreePath)) {
			throw new WorktreeError(`worktree ${worktreeRelativePath} は既に存在します`, {
				path: worktreePath,
				issueNumber,
			});
		}

		// git worktree add実行
		const result = await this.executor.execute("git", [
			"worktree",
			"add",
			worktreePath,
			"-b",
			branchName,
		]);

		if (result.exitCode !== 0) {
			throw new WorktreeError(`worktree作成失敗: ${result.stderr}`, {
				path: worktreePath,
				branchName,
				exitCode: result.exitCode,
			});
		}

		// 環境ファイルをコピー
		await this.copyEnvFiles(worktreePath);

		// WorktreeInfo作成
		const info: WorktreeInfo = {
			issueNumber,
			path: worktreeRelativePath,
			branch: branchName,
			environmentType,
			environmentId: environmentId ?? null,
			createdAt: new Date().toISOString(),
			status: "active",
		};

		// worktrees.jsonに保存（排他制御）
		await this.withLock(async () => {
			const data = await this.loadWorktreesData();
			// 同じIssue番号の古いエントリを削除
			data.worktrees = data.worktrees.filter((w) => w.issueNumber !== issueNumber);
			data.worktrees.push(info);
			await this.saveWorktreesData(data);
		});

		return info;
	}

	/**
	 * worktreeを削除
	 *
	 * @param issueNumber - Issue番号
	 * @param deleteBranch - ブランチも削除するか
	 * @throws WorktreeError - 削除失敗時
	 */
	async removeWorktree(issueNumber: number, deleteBranch = false): Promise<void> {
		// worktrees.jsonから検索
		const data = await this.loadWorktreesData();
		const worktree = data.worktrees.find((w) => w.issueNumber === issueNumber);

		// 存在しない場合は何もしない
		if (!worktree) {
			return;
		}

		const worktreePath = this.getWorktreePath(issueNumber);

		// git worktree remove実行
		const result = await this.executor.execute("git", [
			"worktree",
			"remove",
			worktreePath,
			"--force",
		]);

		if (result.exitCode !== 0) {
			throw new WorktreeError(`worktree削除失敗: ${result.stderr}`, {
				path: worktreePath,
				exitCode: result.exitCode,
			});
		}

		// ブランチ削除
		if (deleteBranch) {
			await this.executor.execute("git", ["branch", "-d", worktree.branch]);
			// ブランチ削除の失敗は警告のみ（マージされていない場合など）
		}

		// worktrees.jsonから削除（排他制御）
		await this.withLock(async () => {
			const currentData = await this.loadWorktreesData();
			currentData.worktrees = currentData.worktrees.filter((w) => w.issueNumber !== issueNumber);
			await this.saveWorktreesData(currentData);
		});
	}

	/**
	 * worktree一覧を取得
	 *
	 * @returns WorktreeInfo配列
	 */
	async listWorktrees(): Promise<WorktreeInfo[]> {
		const data = await this.loadWorktreesData();
		return data.worktrees;
	}

	/**
	 * 特定Issueのworktree情報を取得
	 *
	 * @param issueNumber - Issue番号
	 * @returns WorktreeInfo（存在しない場合はnull）
	 */
	async getWorktree(issueNumber: number): Promise<WorktreeInfo | null> {
		const data = await this.loadWorktreesData();
		return data.worktrees.find((w) => w.issueNumber === issueNumber) ?? null;
	}

	/**
	 * worktree情報を更新
	 *
	 * @param issueNumber - Issue番号
	 * @param updates - 更新するフィールド
	 * @throws WorktreeError - 対象worktreeが存在しない場合
	 */
	async updateWorktree(
		issueNumber: number,
		updates: Partial<Pick<WorktreeInfo, "environmentId" | "environmentType" | "status">>,
	): Promise<void> {
		await this.withLock(async () => {
			const data = await this.loadWorktreesData();
			const worktree = data.worktrees.find((w) => w.issueNumber === issueNumber);

			if (!worktree) {
				throw new WorktreeError(`worktree for Issue #${issueNumber} が見つかりません`, {
					issueNumber,
				});
			}

			// 更新
			if (updates.environmentId !== undefined) {
				worktree.environmentId = updates.environmentId;
			}
			if (updates.environmentType !== undefined) {
				worktree.environmentType = updates.environmentType;
			}
			if (updates.status !== undefined) {
				worktree.status = updates.status;
			}

			await this.saveWorktreesData(data);
		});
	}
}
