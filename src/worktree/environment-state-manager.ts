import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { EnvironmentStateError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import type { IssueStatusLabelManager } from "../output/issue-status-label-manager.js";

/**
 * 環境状態管理設定
 */
export interface EnvironmentStateManagerConfig {
	/**
	 * GitHub Issueメタデータを使用するか
	 * @default true
	 */
	enabled: boolean;

	/**
	 * ラベル管理を有効にするか
	 * @default true
	 */
	useLabels: boolean;

	/**
	 * ラベル接頭辞
	 * @default "orch"
	 */
	labelPrefix: string;
}

/**
 * GitHub Issueに保存する環境メタデータ
 */
export interface EnvironmentMetadata {
	/**
	 * 環境タイプ
	 */
	type: "hybrid" | "worktree-only" | "container-only" | "host";

	/**
	 * worktreeパス（worktree使用時）
	 */
	worktreePath?: string;

	/**
	 * ブランチ名（worktree使用時）
	 */
	branch?: string;

	/**
	 * 実行環境タイプ
	 */
	environmentType: "container-use" | "docker" | "host";

	/**
	 * 環境ID（container-use/dockerの場合）
	 */
	environmentId?: string;

	/**
	 * 作成日時（ISO 8601形式）
	 */
	createdAt: string;

	/**
	 * 最終更新日時（ISO 8601形式）
	 */
	updatedAt: string;
}

/**
 * 環境更新用の入力情報
 */
export interface EnvironmentInfo {
	/**
	 * 環境タイプ
	 */
	type: "hybrid" | "worktree-only" | "container-only" | "host";

	/**
	 * worktreeパス（worktree使用時）
	 */
	worktreePath?: string;

	/**
	 * ブランチ名（worktree使用時）
	 */
	branch?: string;

	/**
	 * 実行環境タイプ
	 */
	environmentType: "container-use" | "docker" | "host";

	/**
	 * 環境ID（container-use/dockerの場合）
	 */
	environmentId?: string;
}

/** メタデータマーカー開始 */
const METADATA_MARKER_START = "<!-- ORCH_ENV_METADATA";
/** メタデータマーカー終了 */
const METADATA_MARKER_END = "-->";

/**
 * 環境状態を管理するクラス
 *
 * GitHub Issueのbodyにメタデータを埋め込み、環境状態を追跡します。
 */
export class EnvironmentStateManager {
	private readonly config: EnvironmentStateManagerConfig;
	private readonly labelManager: IssueStatusLabelManager;
	private readonly executor: ProcessExecutor;

	/**
	 * コンストラクタ
	 * @param config - 設定
	 * @param labelManager - IssueStatusLabelManager
	 * @param executor - プロセス実行器（DI用）
	 */
	constructor(
		config: EnvironmentStateManagerConfig,
		labelManager: IssueStatusLabelManager,
		executor: ProcessExecutor = new BunProcessExecutor(),
	) {
		this.config = config;
		this.labelManager = labelManager;
		this.executor = executor;
	}

	/**
	 * 環境状態を更新
	 *
	 * @param issueNumber - Issue番号
	 * @param envInfo - 環境情報
	 * @throws EnvironmentStateError - 更新失敗時
	 */
	async updateEnvironmentState(issueNumber: number, envInfo: EnvironmentInfo): Promise<void> {
		if (!this.config.enabled) {
			logger.debug("環境状態管理は無効です");
			return;
		}

		const now = new Date().toISOString();
		const metadata: EnvironmentMetadata = {
			...envInfo,
			createdAt: now,
			updatedAt: now,
		};

		// 現在のIssue bodyを取得
		const currentBody = await this.getIssueBody(issueNumber);
		if (currentBody === null) {
			throw new EnvironmentStateError(`Issue #${issueNumber} が見つかりません`, {
				issueNumber,
			});
		}

		// 既存のメタデータを削除して新しいメタデータを追加
		const newBody = this.replaceMetadata(currentBody, metadata);

		// Issue bodyを更新
		await this.updateIssueBody(issueNumber, newBody);

		// ラベルを更新
		if (this.config.useLabels) {
			await this.labelManager.updateStatus(issueNumber, "running");
		}

		logger.debug(`Issue #${issueNumber} の環境状態を更新しました`);
	}

	/**
	 * 環境状態を取得
	 *
	 * @param issueNumber - Issue番号
	 * @returns EnvironmentMetadata（存在しない場合はnull）
	 */
	async getEnvironmentState(issueNumber: number): Promise<EnvironmentMetadata | null> {
		if (!this.config.enabled) {
			return null;
		}

		const body = await this.getIssueBody(issueNumber);
		if (body === null) {
			return null;
		}

		return this.extractMetadata(body);
	}

	/**
	 * 環境状態をクリア
	 *
	 * @param issueNumber - Issue番号
	 */
	async clearEnvironmentState(issueNumber: number): Promise<void> {
		if (!this.config.enabled) {
			logger.debug("環境状態管理は無効です");
			return;
		}

		const currentBody = await this.getIssueBody(issueNumber);
		if (currentBody === null) {
			return;
		}

		// メタデータが存在しない場合は何もしない
		if (!this.extractMetadata(currentBody)) {
			return;
		}

		// メタデータを削除
		const newBody = this.removeMetadata(currentBody);

		// Issue bodyを更新
		await this.updateIssueBody(issueNumber, newBody);

		logger.debug(`Issue #${issueNumber} の環境状態をクリアしました`);
	}

	/**
	 * Issue bodyを取得
	 */
	private async getIssueBody(issueNumber: number): Promise<string | null> {
		const result = await this.executor.spawn("gh", [
			"issue",
			"view",
			String(issueNumber),
			"--json",
			"body",
		]);

		if (result.exitCode !== 0) {
			return null;
		}

		try {
			const issue = JSON.parse(result.stdout);
			return issue.body ?? "";
		} catch {
			return null;
		}
	}

	/**
	 * Issue bodyを更新
	 */
	private async updateIssueBody(issueNumber: number, body: string): Promise<void> {
		const result = await this.executor.spawn("gh", [
			"issue",
			"edit",
			String(issueNumber),
			"--body",
			body,
		]);

		if (result.exitCode !== 0) {
			throw new EnvironmentStateError(`環境状態更新失敗: ${result.stderr}`, {
				issueNumber,
				stderr: result.stderr,
			});
		}
	}

	/**
	 * bodyからメタデータを抽出
	 */
	private extractMetadata(body: string): EnvironmentMetadata | null {
		const startIndex = body.indexOf(METADATA_MARKER_START);
		if (startIndex === -1) {
			return null;
		}

		const endIndex = body.indexOf(METADATA_MARKER_END, startIndex);
		if (endIndex === -1) {
			return null;
		}

		const metadataStr = body.slice(startIndex + METADATA_MARKER_START.length, endIndex).trim();

		try {
			return JSON.parse(metadataStr);
		} catch {
			return null;
		}
	}

	/**
	 * メタデータを置換
	 */
	private replaceMetadata(body: string, metadata: EnvironmentMetadata): string {
		// 既存のメタデータを削除
		const cleanBody = this.removeMetadata(body);

		// 新しいメタデータを追加
		const metadataBlock = `\n\n${METADATA_MARKER_START}\n${JSON.stringify(metadata, null, 2)}\n${METADATA_MARKER_END}`;
		return cleanBody.trimEnd() + metadataBlock;
	}

	/**
	 * メタデータを削除
	 */
	private removeMetadata(body: string): string {
		const startIndex = body.indexOf(METADATA_MARKER_START);
		if (startIndex === -1) {
			return body;
		}

		const endIndex = body.indexOf(METADATA_MARKER_END, startIndex);
		if (endIndex === -1) {
			return body;
		}

		return body.slice(0, startIndex).trimEnd() + body.slice(endIndex + METADATA_MARKER_END.length);
	}
}
