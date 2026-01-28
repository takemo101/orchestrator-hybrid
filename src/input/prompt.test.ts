import { describe, expect, test } from "bun:test";
import type { IssueInfo } from "../core/types";
import { PromptGenerator } from "./prompt";

/**
 * PromptGenerator テスト
 *
 * テンプレートベースのプロンプト生成機能のテスト。
 * - 変数展開 ({{variable}})
 * - Hat指示の追加
 * - デフォルトテンプレートのフォールバック
 */

/** テスト用Issue情報 */
const SAMPLE_ISSUE: IssueInfo = {
	number: 42,
	title: "Add user authentication",
	body: "## Task\nImplement JWT-based authentication",
	labels: ["enhancement", "priority:high"],
};

/** 最小限のIssue */
const MINIMAL_ISSUE: IssueInfo = {
	number: 1,
	title: "Fix typo",
	body: "",
	labels: [],
};

/** Hat指示付きコンテキスト */
const HAT_CONTEXT = {
	hatName: "Tester",
	hatInstructions: "Write unit tests for all public methods.",
};

/** Hat無しコンテキスト */
const NO_HAT_CONTEXT = {
	hatName: undefined as string | undefined,
	hatInstructions: undefined as string | undefined,
};

describe("PromptGenerator", () => {
	describe("generate", () => {
		test("Issue情報を含むプロンプトを生成する", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(SAMPLE_ISSUE);

			expect(result).toContain("42");
			expect(result).toContain("Add user authentication");
			expect(result).toContain("Implement JWT-based authentication");
		});

		test("ラベル情報を含むプロンプトを生成する", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(SAMPLE_ISSUE);

			expect(result).toContain("enhancement");
			expect(result).toContain("priority:high");
		});

		test("Hat指示付きのプロンプトを生成する", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(SAMPLE_ISSUE, HAT_CONTEXT);

			expect(result).toContain("Tester");
			expect(result).toContain("Write unit tests for all public methods.");
		});

		test("Hat指示なしでもプロンプトを生成できる", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(SAMPLE_ISSUE, NO_HAT_CONTEXT);

			expect(result).toContain("Add user authentication");
			// Hatセクションが含まれないことを確認
			expect(result).not.toContain("Current Hat");
		});

		test("本文が空のIssueでもプロンプトを生成できる", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(MINIMAL_ISSUE);

			expect(result).toContain("Fix typo");
		});

		test("LOOP_COMPLETEキーワードの説明を含む", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(SAMPLE_ISSUE);

			expect(result).toContain("LOOP_COMPLETE");
		});

		test("コンテキストなし(undefined)で呼び出してもエラーにならない", () => {
			const generator = new PromptGenerator();
			const result = generator.generate(SAMPLE_ISSUE, undefined);

			expect(result).toContain("Add user authentication");
		});
	});

	describe("applyVariables", () => {
		test("テンプレート変数を展開する", () => {
			const generator = new PromptGenerator();
			const template = "Issue #{{issue_number}}: {{issue_title}}";
			const result = generator.applyVariables(template, {
				issue_number: "42",
				issue_title: "Test title",
			});

			expect(result).toBe("Issue #42: Test title");
		});

		test("未定義の変数は空文字列で置換する", () => {
			const generator = new PromptGenerator();
			const template = "{{defined}} and {{undefined_var}}";
			const result = generator.applyVariables(template, {
				defined: "hello",
			});

			expect(result).toBe("hello and ");
		});

		test("変数名の前後に空白があっても展開できる", () => {
			const generator = new PromptGenerator();
			const template = "{{ name }} and {{  spaced  }}";
			const result = generator.applyVariables(template, {
				name: "Alice",
				spaced: "value",
			});

			expect(result).toBe("Alice and value");
		});

		test("変数がない場合はテンプレートをそのまま返す", () => {
			const generator = new PromptGenerator();
			const template = "No variables here";
			const result = generator.applyVariables(template, {});

			expect(result).toBe("No variables here");
		});

		test("同一変数が複数回出現した場合すべて展開する", () => {
			const generator = new PromptGenerator();
			const template = "{{name}} is {{name}}";
			const result = generator.applyVariables(template, { name: "Alice" });

			expect(result).toBe("Alice is Alice");
		});
	});

	describe("buildVariables", () => {
		test("IssueInfoから変数マップを構築する", () => {
			const generator = new PromptGenerator();
			const vars = generator.buildVariables(SAMPLE_ISSUE);

			expect(vars.issue_number).toBe("42");
			expect(vars.issue_title).toBe("Add user authentication");
			expect(vars.issue_body).toContain("JWT-based authentication");
		});

		test("ラベルをカンマ区切りで格納する", () => {
			const generator = new PromptGenerator();
			const vars = generator.buildVariables(SAMPLE_ISSUE);

			expect(vars.issue_labels).toBe("enhancement, priority:high");
		});

		test("ラベルなしの場合は空文字列", () => {
			const generator = new PromptGenerator();
			const vars = generator.buildVariables(MINIMAL_ISSUE);

			expect(vars.issue_labels).toBe("");
		});

		test("Hat情報を変数に含める", () => {
			const generator = new PromptGenerator();
			const vars = generator.buildVariables(SAMPLE_ISSUE, HAT_CONTEXT);

			expect(vars.hat_name).toBe("Tester");
			expect(vars.hat_instructions).toBe("Write unit tests for all public methods.");
		});

		test("Hat情報なしの場合は空文字列", () => {
			const generator = new PromptGenerator();
			const vars = generator.buildVariables(SAMPLE_ISSUE);

			expect(vars.hat_name).toBe("");
			expect(vars.hat_instructions).toBe("");
		});

		test("current_date変数が存在する", () => {
			const generator = new PromptGenerator();
			const vars = generator.buildVariables(SAMPLE_ISSUE);

			expect(vars.current_date).toBeDefined();
			expect(vars.current_date.length).toBeGreaterThan(0);
		});
	});
});
