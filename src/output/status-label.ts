/**
 * F-009 ステータスラベル管理
 *
 * GitHub Issueにステータスラベルを自動付与し、タスクの進行状態を可視化する。
 */

import { GitHubError } from "../core/errors.js";

/**
 * ステータス値の定義
 */
export type IssueStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "blocked"
	| "pr-created"
	| "merged";

/**
 * ステータスとラベル色のマッピング
 */
export const STATUS_COLORS: Record<IssueStatus, string> = {
	queued: "c2e0c6", // 薄緑
	running: "0e8a16", // 緑
	completed: "0075ca", // 青
	failed: "d73a4a", // 赤
	blocked: "fbca04", // 黄
	"pr-created": "6f42c1", // 紫
	merged: "1d76db", // 濃青
};

/**
 * 排他的ステータス（同時に1つのみ）
 */
const EXCLUSIVE_STATUSES: IssueStatus[] = ["queued", "running", "completed", "failed", "blocked"];

/**
 * コマンド実行インターフェース
 */
export interface CommandExecutor {
	exec(
		command: string,
		args: string[],
	): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

/**
 * StatusLabelManager
 *
 * GitHub CLIを使用してIssueのステータスラベルを管理する。
 */
export class StatusLabelManager {
	constructor(
		private readonly executor: CommandExecutor,
		private readonly prefix: string = "orch",
	) {}

	/**
	 * ラベル名を生成する
	 */
	private labelName(status: IssueStatus): string {
		return `${this.prefix}:${status}`;
	}

	/**
	 * リポジトリに必要なラベルが存在するか確認し、なければ作成する
	 */
	async ensureLabelsExist(): Promise<void> {
		// 既存ラベル一覧を取得
		const existingLabels = await this.getExistingLabels();

		// 全ステータスのラベルを確認・作成
		for (const status of Object.keys(STATUS_COLORS) as IssueStatus[]) {
			const labelName = this.labelName(status);
			if (!existingLabels.has(labelName)) {
				await this.createLabel(labelName, STATUS_COLORS[status]);
				existingLabels.add(labelName);
			}
		}
	}

	/**
	 * Issueのステータスを更新する
	 *
	 * @param issueNumber Issue番号
	 * @param status 新しいステータス
	 */
	async syncStatus(issueNumber: number, status: IssueStatus): Promise<void> {
		const newLabel = this.labelName(status);

		// 排他的ステータスの場合、他のステータスラベルを削除
		if (EXCLUSIVE_STATUSES.includes(status)) {
			await this.removeExclusiveLabels(issueNumber, status);
		}

		// 新しいラベルを付与
		await this.addLabel(issueNumber, newLabel);
	}

	/**
	 * 対象Issueから全てのステータスラベルを削除する
	 */
	async removeStatusLabels(issueNumber: number): Promise<void> {
		for (const status of Object.keys(STATUS_COLORS) as IssueStatus[]) {
			const labelName = this.labelName(status);
			await this.removeLabel(issueNumber, labelName);
		}
	}

	/**
	 * 既存のラベル一覧を取得する
	 */
	private async getExistingLabels(): Promise<Set<string>> {
		const result = await this.executor.exec("gh", ["label", "list", "--json", "name"]);

		if (result.exitCode !== 0) {
			throw new GitHubError(`Failed to list labels: ${result.stderr}`);
		}

		try {
			const labels = JSON.parse(result.stdout) as Array<{ name: string }>;
			return new Set(labels.map((l) => l.name));
		} catch {
			return new Set();
		}
	}

	/**
	 * ラベルを作成する
	 */
	private async createLabel(name: string, color: string): Promise<void> {
		const result = await this.executor.exec("gh", [
			"label",
			"create",
			name,
			"--color",
			color,
			"--description",
			"Managed by orchestrator-hybrid",
		]);

		// エラーでもログのみで継続（ラベル作成失敗でメインループを止めない）
		if (result.exitCode !== 0) {
			console.warn(`Warning: Failed to create label ${name}: ${result.stderr}`);
		}
	}

	/**
	 * Issueにラベルを追加する
	 */
	private async addLabel(issueNumber: number, labelName: string): Promise<void> {
		const result = await this.executor.exec("gh", [
			"issue",
			"edit",
			String(issueNumber),
			"--add-label",
			labelName,
		]);

		if (result.exitCode !== 0) {
			console.warn(
				`Warning: Failed to add label ${labelName} to issue #${issueNumber}: ${result.stderr}`,
			);
		}
	}

	/**
	 * Issueからラベルを削除する
	 */
	private async removeLabel(issueNumber: number, labelName: string): Promise<void> {
		const result = await this.executor.exec("gh", [
			"issue",
			"edit",
			String(issueNumber),
			"--remove-label",
			labelName,
		]);

		// ラベルが存在しない場合のエラーは無視
		if (result.exitCode !== 0 && !result.stderr.includes("not found")) {
			console.warn(
				`Warning: Failed to remove label ${labelName} from issue #${issueNumber}: ${result.stderr}`,
			);
		}
	}

	/**
	 * 排他的ステータスラベルを削除する
	 */
	private async removeExclusiveLabels(
		issueNumber: number,
		exceptStatus: IssueStatus,
	): Promise<void> {
		for (const status of EXCLUSIVE_STATUSES) {
			if (status !== exceptStatus) {
				const labelName = this.labelName(status);
				await this.removeLabel(issueNumber, labelName);
			}
		}
	}
}
