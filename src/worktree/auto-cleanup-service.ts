import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { AutoCleanupError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import type { EnvironmentStateManager } from "./environment-state-manager.js";
import type { HybridEnvironmentBuilder } from "./hybrid-environment-builder.js";

/**
 * 自動クリーンアップ設定
 */
export interface AutoCleanupServiceConfig {
	/**
	 * 自動クリーンアップを有効にするか
	 * @default true
	 */
	enabled: boolean;

	/**
	 * PRマージ確認のタイムアウト（秒）
	 * @default 60
	 */
	mergeCheckTimeoutSecs: number;

	/**
	 * ブランチも削除するか
	 * @default true
	 */
	deleteBranch: boolean;
}

/**
 * クリーンアップ結果
 */
export interface CleanupResult {
	/**
	 * Issue番号
	 */
	issueNumber: number;

	/**
	 * クリーンアップが実行されたか
	 */
	cleaned: boolean;

	/**
	 * 削除された環境タイプ
	 */
	environmentType?: "container-use" | "docker" | "host";

	/**
	 * worktreeが削除されたか
	 */
	worktreeRemoved: boolean;

	/**
	 * ブランチが削除されたか
	 */
	branchRemoved: boolean;

	/**
	 * エラーメッセージ（失敗時）
	 */
	error?: string;
}

/**
 * 自動クリーンアップを実行するクラス
 *
 * PRマージ後に、worktree + container-use/docker環境を自動的に削除します。
 */
export class AutoCleanupService {
	private readonly config: AutoCleanupServiceConfig;
	private readonly environmentBuilder: HybridEnvironmentBuilder;
	private readonly stateManager: EnvironmentStateManager;
	private readonly executor: ProcessExecutor;

	/**
	 * コンストラクタ
	 * @param config - 設定
	 * @param environmentBuilder - HybridEnvironmentBuilder
	 * @param stateManager - EnvironmentStateManager
	 * @param executor - プロセス実行器（DI用）
	 */
	constructor(
		config: AutoCleanupServiceConfig,
		environmentBuilder: HybridEnvironmentBuilder,
		stateManager: EnvironmentStateManager,
		executor: ProcessExecutor = new BunProcessExecutor(),
	) {
		this.config = config;
		this.environmentBuilder = environmentBuilder;
		this.stateManager = stateManager;
		this.executor = executor;
	}

	/**
	 * PRマージ後のクリーンアップを実行
	 *
	 * @param issueNumber - Issue番号
	 * @returns CleanupResult
	 * @throws AutoCleanupError - クリーンアップ失敗時
	 */
	async cleanup(issueNumber: number): Promise<CleanupResult> {
		const result: CleanupResult = {
			issueNumber,
			cleaned: false,
			worktreeRemoved: false,
			branchRemoved: false,
		};

		if (!this.config.enabled) {
			logger.debug("自動クリーンアップは無効です");
			return result;
		}

		// PRがマージされているか確認
		const isMerged = await this.isPRMerged(issueNumber);
		if (!isMerged) {
			logger.debug(`Issue #${issueNumber} のPRはまだマージされていません`);
			return result;
		}

		// 環境状態を取得
		const metadata = await this.stateManager.getEnvironmentState(issueNumber);
		if (!metadata) {
			logger.debug(`Issue #${issueNumber} の環境状態が見つかりません`);
			return result;
		}

		result.environmentType = metadata.environmentType;

		try {
			// 環境タイプに応じたクリーンアップ
			if (metadata.type === "hybrid") {
				// container-use/docker環境を削除
				await this.environmentBuilder.destroyEnvironment(issueNumber);

				// worktreeを削除
				if (metadata.worktreePath) {
					await this.removeWorktree(metadata.worktreePath);
					result.worktreeRemoved = true;
				}

				// ブランチを削除
				if (this.config.deleteBranch && metadata.branch) {
					await this.removeBranch(metadata.branch);
					result.branchRemoved = true;
				}
			} else if (metadata.type === "worktree-only") {
				// worktreeのみ削除
				if (metadata.worktreePath) {
					await this.removeWorktree(metadata.worktreePath);
					result.worktreeRemoved = true;
				}

				// ブランチを削除
				if (this.config.deleteBranch && metadata.branch) {
					await this.removeBranch(metadata.branch);
					result.branchRemoved = true;
				}
			} else if (metadata.type === "container-only") {
				// container-use/docker環境のみ削除
				await this.environmentBuilder.destroyEnvironment(issueNumber);
			}
			// host環境の場合は何もしない

			// 環境状態をクリア
			await this.stateManager.clearEnvironmentState(issueNumber);

			result.cleaned = true;
			logger.info(`Issue #${issueNumber} の環境をクリーンアップしました`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			result.error = errorMessage;
			throw new AutoCleanupError(`クリーンアップ失敗: ${errorMessage}`, {
				issueNumber,
				environmentType: metadata.environmentType,
			});
		}

		return result;
	}

	/**
	 * PRがマージされているか確認
	 *
	 * @param issueNumber - Issue番号
	 * @returns マージ済みの場合はtrue
	 */
	async isPRMerged(issueNumber: number): Promise<boolean> {
		const result = await this.executor.spawn("gh", [
			"pr",
			"view",
			String(issueNumber),
			"--json",
			"state,mergedAt",
		]);

		if (result.exitCode !== 0) {
			return false;
		}

		try {
			const pr = JSON.parse(result.stdout);
			return pr.state === "MERGED" && pr.mergedAt !== null;
		} catch {
			return false;
		}
	}

	/**
	 * worktreeを削除
	 */
	private async removeWorktree(worktreePath: string): Promise<void> {
		const result = await this.executor.spawn("git", [
			"worktree",
			"remove",
			worktreePath,
			"--force",
		]);

		if (result.exitCode !== 0) {
			throw new Error(`worktree削除失敗: ${result.stderr}`);
		}

		logger.debug(`worktree削除: ${worktreePath}`);
	}

	/**
	 * ブランチを削除
	 */
	private async removeBranch(branch: string): Promise<void> {
		const result = await this.executor.spawn("git", ["branch", "-d", branch]);

		if (result.exitCode !== 0) {
			// ブランチ削除失敗は警告のみ
			logger.warn(`ブランチ削除失敗（無視）: ${result.stderr}`);
			return;
		}

		logger.debug(`ブランチ削除: ${branch}`);
	}
}
