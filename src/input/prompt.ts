import type { IssueInfo } from "../core/types.js";

/**
 * Hat実行コンテキスト
 */
export interface HatContext {
	/** 現在のHat名 */
	hatName?: string;
	/** Hat固有の追加指示 */
	hatInstructions?: string;
}

/**
 * プロンプト生成器
 *
 * GitHub Issueの情報とHatコンテキストを組み合わせて、
 * AIバックエンドに渡すMarkdown形式のプロンプトを生成する。
 *
 * テンプレート内の `{{variable}}` を変数値で展開する。
 */
export class PromptGenerator {
	/**
	 * プロンプトを生成する
	 *
	 * @param issue - GitHub Issue情報
	 * @param context - Hat実行コンテキスト（省略可）
	 * @returns 生成されたプロンプト文字列（Markdown形式）
	 */
	generate(issue: IssueInfo, context?: HatContext): string {
		const variables = this.buildVariables(issue, context);
		const template = this.getTemplate(context);
		return this.applyVariables(template, variables);
	}

	/**
	 * テンプレート変数を展開する
	 *
	 * `{{key}}` 形式の変数を、対応する値で置換する。
	 * 変数名の前後の空白は許容する。
	 * 未定義の変数は空文字列で置換する。
	 *
	 * @param template - テンプレート文字列
	 * @param variables - 変数マップ
	 * @returns 展開後の文字列
	 */
	applyVariables(template: string, variables: Record<string, string>): string {
		return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => {
			return variables[key] ?? "";
		});
	}

	/**
	 * Issue情報とコンテキストから変数マップを構築する
	 *
	 * @param issue - GitHub Issue情報
	 * @param context - Hat実行コンテキスト（省略可）
	 * @returns 変数マップ
	 */
	buildVariables(issue: IssueInfo, context?: HatContext): Record<string, string> {
		return {
			issue_number: String(issue.number),
			issue_title: issue.title,
			issue_body: issue.body,
			issue_labels: issue.labels.join(", "),
			hat_name: context?.hatName ?? "",
			hat_instructions: context?.hatInstructions ?? "",
			current_date: new Date().toISOString().split("T")[0],
		};
	}

	/**
	 * テンプレートを取得する
	 *
	 * Hatコンテキストの有無に応じて適切なテンプレートを返す。
	 * v3.0.0ではデフォルトの組み込みテンプレートを使用する。
	 */
	private getTemplate(context?: HatContext): string {
		const hasHat = context?.hatName != null && context.hatName.length > 0;

		const sections: string[] = [this.getSystemSection(), this.getUserRequestSection()];

		if (hasHat) {
			sections.push(this.getHatInstructionSection());
		}

		return sections.join("\n\n");
	}

	/**
	 * システムセクション: AIの基本ルールと動作仕様
	 */
	private getSystemSection(): string {
		return [
			"# System Instructions",
			"",
			"You are an AI agent executing a task from a GitHub Issue.",
			"",
			"## Rules",
			"- When the task is fully complete, output `LOOP_COMPLETE` as the last line.",
			"- Do not output `LOOP_COMPLETE` until all work is done and verified.",
			"- Think step by step before making changes.",
			"- Verify your changes compile and pass tests before declaring completion.",
		].join("\n");
	}

	/**
	 * ユーザーリクエストセクション: Issue情報
	 */
	private getUserRequestSection(): string {
		return [
			"# Task",
			"",
			"## Issue #{{issue_number}}: {{issue_title}}",
			"",
			"{{issue_body}}",
			"",
			"**Labels**: {{issue_labels}}",
		].join("\n");
	}

	/**
	 * Hat指示セクション: 現在のHatの役割と指示
	 */
	private getHatInstructionSection(): string {
		return ["# Current Hat: {{hat_name}}", "", "{{hat_instructions}}"].join("\n");
	}
}
