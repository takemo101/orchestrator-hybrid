/**
 * IssueGenerator - 改善提案からGitHub Issueを自動作成
 *
 * @module
 */

import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { logger } from "../core/logger.js";
import { writeFileSync } from "node:fs";

/**
 * 改善提案の優先度
 */
export type ImprovementPriority = "high" | "medium" | "low";

/**
 * 改善提案のカテゴリ
 */
export type ImprovementCategory =
	| "refactoring"
	| "performance"
	| "security"
	| "documentation"
	| "testing";

/**
 * 改善提案を表すデータ構造
 */
export interface ImprovementSuggestion {
	/** Issue タイトル（必須） */
	title: string;

	/** Issue 本文（Markdown形式、必須） */
	description: string;

	/** 優先度（必須） */
	priority: ImprovementPriority;

	/** 関連ファイルパス（必須、空配列可） */
	relatedFiles: string[];

	/** カテゴリ（オプション） */
	category?: ImprovementCategory;

	/** メタデータ（オプション） */
	metadata?: {
		/** 一意識別子（ハッシュ） */
		id: string;
		/** 抽出元 */
		source: "scratchpad" | "events" | "output";
		/** 抽出日時 */
		extractedAt: Date;
	};
}

/**
 * IssueGenerator設定
 */
export interface IssueGeneratorConfig {
	/** Issue自動作成の有効/無効（必須） */
	enabled: boolean;

	/** 最低優先度閾値（必須） */
	minPriority: ImprovementPriority;

	/** 自動付与ラベル（必須、空配列可） */
	labels: string[];

	/** 対象リポジトリ（オプション、空文字列=カレントリポジトリ） */
	repository?: string;

	/** 重複チェックの有効/無効（オプション、デフォルト: true） */
	duplicateCheckEnabled?: boolean;

	/** カスタムテンプレートパス（オプション） */
	templatePath?: string;
}

/**
 * 改善提案からGitHub Issueを自動作成するクラス
 */
export class IssueGenerator {
	private readonly config: IssueGeneratorConfig;
	private readonly executor: ProcessExecutor;

	/**
	 * コンストラクタ
	 * @param config Issue作成設定
	 * @param executor プロセス実行インターフェース（テスト用にDI可能）
	 */
	constructor(config: IssueGeneratorConfig, executor: ProcessExecutor = new BunProcessExecutor()) {
		this.config = config;
		this.executor = executor;
	}

	/**
	 * 複数の改善提案からIssueを作成
	 * @param suggestions 改善提案配列
	 * @returns 作成されたIssue URL配列
	 */
	async createIssues(suggestions: ImprovementSuggestion[]): Promise<string[]> {
		if (!this.config.enabled) {
			logger.info("Issue自動作成は無効です");
			return [];
		}

		// gh CLI利用可能性チェック
		if (!(await this.isGhCliAvailable())) {
			logger.warn("gh CLIが利用できません。Issue自動作成をスキップします。");
			return [];
		}

		const createdIssues: string[] = [];

		for (const suggestion of suggestions) {
			try {
				// 優先度フィルタ
				if (!this.shouldCreateIssue(suggestion.priority)) {
					logger.debug(
						`優先度が低いためスキップ: ${suggestion.title} (${suggestion.priority})`
					);
					continue;
				}

				// 重複チェック
				if (await this.isDuplicate(suggestion)) {
					logger.debug(`重複のためスキップ: ${suggestion.title}`);
					continue;
				}

				// Issue作成
				const issueUrl = await this.createIssue(suggestion);
				createdIssues.push(issueUrl);
				logger.success(`Issue作成: ${issueUrl}`);
			} catch (error) {
				logger.error(
					`Issue作成に失敗: ${suggestion.title}`,
					error instanceof Error ? error.message : String(error)
				);
				// 次の提案へ続行
			}
		}

		return createdIssues;
	}

	/**
	 * gh CLIが利用可能かチェック
	 * @returns 利用可能ならtrue
	 */
	private async isGhCliAvailable(): Promise<boolean> {
		try {
			const result = await this.executor.spawn("gh", ["--version"]);
			return result.exitCode === 0;
		} catch {
			return false;
		}
	}

	/**
	 * 優先度に基づいてIssue作成すべきか判定
	 * @param priority 改善提案の優先度
	 * @returns 作成すべきならtrue
	 */
	private shouldCreateIssue(priority: ImprovementPriority): boolean {
		const priorityOrder: Record<ImprovementPriority, number> = {
			high: 3,
			medium: 2,
			low: 1,
		};

		const minPriorityValue = priorityOrder[this.config.minPriority];
		const suggestionPriorityValue = priorityOrder[priority];

		return suggestionPriorityValue >= minPriorityValue;
	}

	/**
	 * 既存Issueとの重複をチェック
	 * @param suggestion 改善提案
	 * @returns 重複ありならtrue
	 */
	private async isDuplicate(suggestion: ImprovementSuggestion): Promise<boolean> {
		if (this.config.duplicateCheckEnabled === false) {
			return false;
		}

		try {
			// タイトルで検索
			const searchQuery = `in:title "${suggestion.title}"`;

			const result = await this.executor.spawn("gh", [
				"issue",
				"list",
				"--search",
				searchQuery,
				"--state",
				"open",
				"--json",
				"title,number",
				"--limit",
				"10",
			]);

			if (result.exitCode !== 0) {
				logger.warn("重複チェックに失敗しました。Issue作成を続行します。");
				return false;
			}

			const issues = JSON.parse(result.stdout);

			// 完全一致チェック（大文字小文字を無視）
			return issues.some(
				(issue: { title: string }) =>
					issue.title.toLowerCase() === suggestion.title.toLowerCase()
			);
		} catch (error) {
			logger.warn(
				"重複チェック中にエラーが発生しました。Issue作成を続行します。",
				error instanceof Error ? error.message : String(error)
			);
			return false;
		}
	}

	/**
	 * GitHub Issueを作成
	 * @param suggestion 改善提案
	 * @returns 作成されたIssue URL
	 */
	private async createIssue(suggestion: ImprovementSuggestion): Promise<string> {
		const body = this.buildIssueBody(suggestion);
		const labels = this.buildLabels(suggestion);

		// 一時ファイルにbodyを書き込み（シェルエスケープ問題を回避）
		const tempFilePath = "/tmp/orch-issue-body.md";
		writeFileSync(tempFilePath, body);

		const args = [
			"issue",
			"create",
			"--title",
			suggestion.title,
			"--body-file",
			tempFilePath,
			"--label",
			labels.join(","),
		];

		// リポジトリ指定がある場合
		if (this.config.repository) {
			args.push("--repo", this.config.repository);
		}

		const result = await this.executor.spawn("gh", args);

		if (result.exitCode !== 0) {
			throw new Error(`Issue作成に失敗: ${result.stderr}`);
		}

		// URLを抽出
		const match = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
		return match ? match[0] : result.stdout.trim();
	}

	/**
	 * Issue本文を構築
	 * @param suggestion 改善提案
	 * @returns Markdown形式のIssue本文
	 */
	private buildIssueBody(suggestion: ImprovementSuggestion): string {
		// デフォルトテンプレート
		const relatedFilesMarkdown =
			suggestion.relatedFiles.length > 0
				? suggestion.relatedFiles.map((file) => `- \`${file}\``).join("\n")
				: "なし";

		const categorySection = suggestion.category
			? `### カテゴリ\n${suggestion.category}\n\n`
			: "";

		const metadataSection = suggestion.metadata
			? `### メタデータ\n<!-- \nMETADATA: ${JSON.stringify(suggestion.metadata)}\n-->\n\n`
			: "";

		return `## 改善提案

### 概要
${suggestion.description}

### 優先度
${suggestion.priority}

${categorySection}### 関連ファイル
${relatedFilesMarkdown}

### 提案者
ralph-loop (自動生成)

${metadataSection}---
*このIssueは自動生成されました*
`;
	}

	/**
	 * Issue作成時に付与するラベルを構築
	 * @param suggestion 改善提案
	 * @returns ラベル配列
	 */
	private buildLabels(suggestion: ImprovementSuggestion): string[] {
		const labels = [...this.config.labels];

		// 優先度ラベル
		labels.push(`priority:${suggestion.priority}`);

		// カテゴリラベル
		if (suggestion.category) {
			labels.push(`category:${suggestion.category}`);
		}

		return labels;
	}
}
