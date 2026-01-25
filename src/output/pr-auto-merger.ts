/**
 * PRAutoMerger - PR自動マージ機能
 *
 * PR作成後、CIが成功したら自動的にマージする機能を提供します。
 *
 * @module
 */

import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { PRAutoMergeError } from "../core/errors.js";
import { logger } from "../core/logger.js";

/**
 * PR自動マージ設定
 */
export interface PRAutoMergerConfig {
	/**
	 * 自動マージを有効にするか
	 * @default false
	 */
	enabled: boolean;

	/**
	 * マージ方式
	 * - squash: コミットをまとめてマージ（推奨）
	 * - merge: マージコミットを作成
	 * - rebase: リベースしてマージ
	 * @default "squash"
	 */
	mergeMethod: "squash" | "merge" | "rebase";

	/**
	 * マージ後にブランチを削除するか
	 * @default true
	 */
	deleteBranch: boolean;

	/**
	 * CIタイムアウト（秒）
	 * @default 600 (10分)
	 */
	ciTimeoutSecs: number;
}

/**
 * PR自動マージを実行するクラス
 *
 * @example
 * ```typescript
 * const merger = new PRAutoMerger({
 *   enabled: true,
 *   mergeMethod: "squash",
 *   deleteBranch: true,
 *   ciTimeoutSecs: 600,
 * });
 *
 * try {
 *   await merger.autoMerge(123);
 *   console.log("PR merged successfully");
 * } catch (error) {
 *   if (error instanceof PRAutoMergeError) {
 *     console.error("CI failed or timed out");
 *   }
 * }
 * ```
 */
export class PRAutoMerger {
	private readonly config: PRAutoMergerConfig;
	private readonly executor: ProcessExecutor;

	constructor(config: PRAutoMergerConfig, executor: ProcessExecutor = new BunProcessExecutor()) {
		this.config = config;
		this.executor = executor;
	}

	/**
	 * PR作成後、CI成功時に自動マージ
	 *
	 * @param prNumber - PR番号
	 * @returns マージ成功時はtrue、無効時はfalse
	 * @throws PRAutoMergeError - CI失敗、タイムアウト時
	 */
	async autoMerge(prNumber: number): Promise<boolean> {
		if (!this.config.enabled) {
			logger.info("PR自動マージは無効です");
			return false;
		}

		logger.info(`PR #${prNumber} のCI完了を待機中...`);

		// CI完了を待機
		const ciSuccess = await this.waitForCI(prNumber);

		if (!ciSuccess) {
			throw new PRAutoMergeError(`PR #${prNumber} のCI失敗。マージを中断します。`, { prNumber });
		}

		// マージ実行
		await this.merge(prNumber);

		logger.success(`PR #${prNumber} を自動マージしました`);
		return true;
	}

	/**
	 * CIの完了を待機
	 *
	 * @param prNumber - PR番号
	 * @returns CI成功時はtrue、失敗時はfalse
	 * @throws PRAutoMergeError - タイムアウト時
	 */
	private async waitForCI(prNumber: number): Promise<boolean> {
		const result = await this.executor.spawn("gh", ["pr", "checks", String(prNumber), "--watch"], {
			timeout: this.config.ciTimeoutSecs * 1000,
		});

		if (result.exitCode === 0) {
			return true; // CI成功
		}

		// タイムアウトチェック
		// Note: gh pr checks --watchはタイムアウトするとプロセスがkillされる
		// この場合、stderrに"timeout"は含まれないが、exitCodeは非0になる
		// タイムアウトかCI失敗かを区別するため、stderrを確認
		const isTimeout =
			result.stderr.toLowerCase().includes("timeout") ||
			result.stderr.toLowerCase().includes("timed out");

		if (isTimeout) {
			throw new PRAutoMergeError(
				`PR #${prNumber} のCIがタイムアウトしました（${this.config.ciTimeoutSecs}秒）`,
				{ prNumber, timeout: this.config.ciTimeoutSecs },
			);
		}

		return false; // CI失敗
	}

	/**
	 * PRをマージ
	 *
	 * @param prNumber - PR番号
	 * @throws PRAutoMergeError - マージ失敗時
	 */
	private async merge(prNumber: number): Promise<void> {
		const args = ["pr", "merge", String(prNumber), `--${this.config.mergeMethod}`];

		if (this.config.deleteBranch) {
			args.push("--delete-branch");
		}

		const result = await this.executor.spawn("gh", args);

		if (result.exitCode !== 0) {
			throw new PRAutoMergeError(`PR #${prNumber} のマージに失敗: ${result.stderr}`, {
				prNumber,
				stderr: result.stderr,
			});
		}
	}
}
