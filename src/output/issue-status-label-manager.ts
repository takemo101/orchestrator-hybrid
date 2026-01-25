import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { logger } from "../core/logger.js";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";

export type IssueStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "blocked"
	| "pr-created"
	| "merged";

export interface LabelDefinition {
	name: string;
	color: string;
	description: string;
}

export const STATUS_LABELS: Record<IssueStatus, LabelDefinition> = {
	queued: {
		name: "queued",
		color: "c2e0c6",
		description: "実行待ち",
	},
	running: {
		name: "running",
		color: "0e8a16",
		description: "実行中",
	},
	completed: {
		name: "completed",
		color: "1d76db",
		description: "正常完了",
	},
	failed: {
		name: "failed",
		color: "d93f0b",
		description: "失敗",
	},
	blocked: {
		name: "blocked",
		color: "fbca04",
		description: "ブロック中",
	},
	"pr-created": {
		name: "pr-created",
		color: "6f42c1",
		description: "PR作成済み",
	},
	merged: {
		name: "merged",
		color: "0052cc",
		description: "マージ完了",
	},
};

export interface IssueStatusLabelManagerConfig {
	enabled: boolean;
	labelPrefix: string;
}

export class IssueStatusLabelManager {
	private readonly config: IssueStatusLabelManagerConfig;
	private readonly executor: ProcessExecutor;
	private readonly labels: Map<IssueStatus, LabelDefinition>;

	constructor(
		config: IssueStatusLabelManagerConfig,
		executor: ProcessExecutor = new BunProcessExecutor(),
	) {
		this.config = config;
		this.executor = executor;

		this.labels = new Map();
		for (const [status, label] of Object.entries(STATUS_LABELS)) {
			this.labels.set(status as IssueStatus, {
				...label,
				name: `${config.labelPrefix}:${label.name}`,
			});
		}
	}

	async initializeLabels(): Promise<void> {
		if (!this.config.enabled) {
			logger.debug("ラベル機能は無効です");
			return;
		}

		logger.info("ステータスラベルを初期化中...");

		for (const label of this.labels.values()) {
			await this.ensureLabel(label);
		}

		logger.success("ステータスラベルを初期化しました");
	}

	async updateStatus(issueNumber: number, status: IssueStatus): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		try {
			await this.removeAllStatusLabels(issueNumber);

			const label = this.labels.get(status);
			if (!label) {
				logger.warn(`未知のステータス: ${status}`);
				return;
			}

			await this.addLabel(issueNumber, label.name);

			logger.info(`Issue #${issueNumber} のステータスを ${status} に更新しました`);
		} catch (error) {
			logger.warn(`ラベル更新失敗（処理は継続）: ${(error as Error).message}`);
		}
	}

	async getCurrentStatus(issueNumber: number): Promise<IssueStatus | null> {
		if (!this.config.enabled) {
			return null;
		}

		try {
			const result = await this.executor.spawn("gh", [
				"issue",
				"view",
				String(issueNumber),
				"--json",
				"labels",
			]);

			if (result.exitCode !== 0) {
				return null;
			}

			const issue = JSON.parse(result.stdout);
			const currentLabels: string[] = issue.labels?.map((l: { name: string }) => l.name) ?? [];

			for (const [status, label] of this.labels.entries()) {
				if (currentLabels.includes(label.name)) {
					return status;
				}
			}

			return null;
		} catch {
			return null;
		}
	}

	private async ensureLabel(label: LabelDefinition): Promise<void> {
		const result = await this.executor.spawn("gh", [
			"label",
			"list",
			"--search",
			label.name,
			"--json",
			"name",
		]);

		if (result.exitCode === 0) {
			try {
				const labels = JSON.parse(result.stdout);
				if (labels.some((l: { name: string }) => l.name === label.name)) {
					logger.debug(`ラベル ${label.name} は既に存在します`);
					return;
				}
			} catch {
				// JSON解析失敗時は作成を試みる
			}
		}

		const createResult = await this.executor.spawn("gh", [
			"label",
			"create",
			label.name,
			"--color",
			label.color,
			"--description",
			label.description,
			"--force",
		]);

		if (createResult.exitCode === 0) {
			logger.debug(`ラベル ${label.name} を作成しました`);
		} else {
			logger.warn(`ラベル ${label.name} の作成に失敗: ${createResult.stderr}`);
		}
	}

	private async addLabel(issueNumber: number, labelName: string): Promise<void> {
		const result = await this.executor.spawn("gh", [
			"issue",
			"edit",
			String(issueNumber),
			"--add-label",
			labelName,
		]);

		if (result.exitCode !== 0) {
			throw new Error(`ラベル追加失敗: ${result.stderr}`);
		}
	}

	private async removeAllStatusLabels(issueNumber: number): Promise<void> {
		const result = await this.executor.spawn("gh", [
			"issue",
			"view",
			String(issueNumber),
			"--json",
			"labels",
		]);

		if (result.exitCode !== 0) {
			return;
		}

		let currentLabels: string[];
		try {
			const issue = JSON.parse(result.stdout);
			currentLabels = issue.labels?.map((l: { name: string }) => l.name) ?? [];
		} catch {
			return;
		}

		const prefix = `${this.config.labelPrefix}:`;
		for (const labelName of currentLabels) {
			if (labelName.startsWith(prefix)) {
				await this.executor.spawn("gh", [
					"issue",
					"edit",
					String(issueNumber),
					"--remove-label",
					labelName,
				]);
			}
		}
	}

	getAllLabelNames(): string[] {
		return Array.from(this.labels.values()).map((l) => l.name);
	}
}
