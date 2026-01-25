/**
 * 改善点抽出ユーティリティ単体テスト
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import type { LoopContext } from "../core/types.js";
import { extractImprovements } from "./improvement-extractor.js";

describe("extractImprovements", () => {
	const testDir = ".test-improvement-extractor";
	const scratchpadPath = `${testDir}/scratchpad.md`;

	beforeEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	it("Scratchpadから改善提案マーカーを抽出する", async () => {
		const scratchpadContent = `# Scratchpad

## Notes

### 改善提案
<!-- IMPROVEMENT_START priority:high category:refactoring -->
**タイトル**: SandboxAdapterの循環的複雑度が高い

**説明**: 
DockerAdapterのbuildDockerRunArgsメソッドが100行を超えており、
テストが困難になっています。

**関連ファイル**:
- \`src/adapters/docker-adapter.ts\`
<!-- IMPROVEMENT_END -->
`;

		writeFileSync(scratchpadPath, scratchpadContent);

		const context: LoopContext = {
			scratchpadPath,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].title).toBe("SandboxAdapterの循環的複雑度が高い");
		expect(suggestions[0].priority).toBe("high");
		expect(suggestions[0].category).toBe("refactoring");
		expect(suggestions[0].relatedFiles).toEqual(["src/adapters/docker-adapter.ts"]);
		expect(suggestions[0].metadata?.source).toBe("scratchpad");
		expect(suggestions[0].metadata?.id).toBeDefined();
	});

	it("マーカーがない場合は空配列を返す", async () => {
		const scratchpadContent = `# Scratchpad

## Notes

通常のメモ内容です。
`;

		writeFileSync(scratchpadPath, scratchpadContent);

		const context: LoopContext = {
			scratchpadPath,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toEqual([]);
	});

	it("複数の改善提案を抽出する", async () => {
		const scratchpadContent = `# Scratchpad

## Notes

<!-- IMPROVEMENT_START priority:high category:performance -->
**タイトル**: パフォーマンス改善1

**説明**: 説明1
<!-- IMPROVEMENT_END -->

<!-- IMPROVEMENT_START priority:medium category:testing -->
**タイトル**: テスト追加

**説明**: テストカバレッジを向上させる

**関連ファイル**:
- \`src/core/loop.ts\`
- \`src/core/config.ts\`
<!-- IMPROVEMENT_END -->

<!-- IMPROVEMENT_START priority:low category:documentation -->
**タイトル**: ドキュメント更新

**説明**: READMEを更新する
<!-- IMPROVEMENT_END -->
`;

		writeFileSync(scratchpadPath, scratchpadContent);

		const context: LoopContext = {
			scratchpadPath,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toHaveLength(3);
		expect(suggestions[0].title).toBe("パフォーマンス改善1");
		expect(suggestions[0].priority).toBe("high");
		expect(suggestions[1].title).toBe("テスト追加");
		expect(suggestions[1].priority).toBe("medium");
		expect(suggestions[1].relatedFiles).toEqual(["src/core/loop.ts", "src/core/config.ts"]);
		expect(suggestions[2].title).toBe("ドキュメント更新");
		expect(suggestions[2].priority).toBe("low");
	});

	it("優先度が指定されていない場合はmediumがデフォルト", async () => {
		const scratchpadContent = `# Scratchpad

## Notes

<!-- IMPROVEMENT_START -->
**タイトル**: 優先度なしの提案

**説明**: 優先度が指定されていない
<!-- IMPROVEMENT_END -->
`;

		writeFileSync(scratchpadPath, scratchpadContent);

		const context: LoopContext = {
			scratchpadPath,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].priority).toBe("medium");
		expect(suggestions[0].category).toBeUndefined();
	});

	it("Scratchpadファイルが存在しない場合は空配列を返す", async () => {
		const context: LoopContext = {
			scratchpadPath: `${testDir}/nonexistent.md`,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toEqual([]);
	});

	it("タイトルがない場合はその提案をスキップする", async () => {
		const scratchpadContent = `# Scratchpad

## Notes

<!-- IMPROVEMENT_START priority:high -->
**説明**: タイトルがない提案
<!-- IMPROVEMENT_END -->

<!-- IMPROVEMENT_START priority:high -->
**タイトル**: 正常な提案

**説明**: これは正常
<!-- IMPROVEMENT_END -->
`;

		writeFileSync(scratchpadPath, scratchpadContent);

		const context: LoopContext = {
			scratchpadPath,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].title).toBe("正常な提案");
	});

	it("関連ファイルがない場合は空配列", async () => {
		const scratchpadContent = `# Scratchpad

## Notes

<!-- IMPROVEMENT_START priority:high -->
**タイトル**: 関連ファイルなし

**説明**: 関連ファイルが指定されていない
<!-- IMPROVEMENT_END -->
`;

		writeFileSync(scratchpadPath, scratchpadContent);

		const context: LoopContext = {
			scratchpadPath,
			issue: { number: 1, title: "Test", body: "", labels: [], state: "open" },
			iteration: 1,
			maxIterations: 100,
			promptPath: ".agent/PROMPT.md",
			completionPromise: "LOOP_COMPLETE",
			autoMode: false,
			createPR: false,
			draftPR: false,
			useContainer: false,
			generateReport: false,
			reportPath: ".agent/report.md",
		};

		const suggestions = await extractImprovements(context);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].relatedFiles).toEqual([]);
	});
});
