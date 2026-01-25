/**
 * IssueGenerator単体テスト
 */
import { describe, it, expect, beforeEach } from "bun:test";
import { IssueGenerator } from "./issue-generator.js";
import type { ImprovementSuggestion, IssueGeneratorConfig } from "./issue-generator.js";
import type { ProcessExecutor, ProcessResult, SpawnOptions } from "../core/process-executor.js";

/**
 * モックProcessExecutor
 */
class MockProcessExecutor implements ProcessExecutor {
	private mockResults: Map<string, ProcessResult> = new Map();
	public spawnCalls: Array<{ command: string; args: string[]; options?: SpawnOptions }> = [];

	setMockResult(pattern: string, result: ProcessResult): void {
		this.mockResults.set(pattern, result);
	}

	async spawn(command: string, args: string[], options?: SpawnOptions): Promise<ProcessResult> {
		this.spawnCalls.push({ command, args, options });

		// パターンマッチング
		for (const [pattern, result] of this.mockResults) {
			const fullCommand = `${command} ${args.join(" ")}`;
			if (fullCommand.includes(pattern)) {
				return result;
			}
		}

		throw new Error(`No mock result for: ${command} ${args.join(" ")}`);
	}
}

describe("IssueGenerator", () => {
	let mockExecutor: MockProcessExecutor;
	let config: IssueGeneratorConfig;

	beforeEach(() => {
		mockExecutor = new MockProcessExecutor();
		config = {
			enabled: true,
			minPriority: "medium",
			labels: ["auto-generated", "improvement"],
			duplicateCheckEnabled: true,
		};
	});

	describe("createIssues()", () => {
		it("有効な提案からIssueを作成する", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Refactor SandboxAdapter",
					description: "High complexity detected",
					priority: "high",
					relatedFiles: ["src/adapters/sandbox-adapter.ts"],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list (重複チェック)
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/repo/issues/123",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(config, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toHaveLength(1);
			expect(result[0]).toBe("https://github.com/owner/repo/issues/123");
		});

		it("minPriorityがmediumの時、lowは優先度スキップされる", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Minor typo fix",
					description: "Fix typo in comment",
					priority: "low",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(config, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toEqual([]);
		});

		it("minPriorityがlowの時、全ての優先度が作成される", async () => {
			const lowPriorityConfig: IssueGeneratorConfig = {
				...config,
				minPriority: "low",
			};

			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Low priority task",
					description: "Low priority description",
					priority: "low",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list (重複チェック)
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/repo/issues/124",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(lowPriorityConfig, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toHaveLength(1);
		});

		it("重複Issueはスキップされる", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Existing Issue",
					description: "This already exists",
					priority: "high",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list (重複あり)
			mockExecutor.setMockResult("issue list", {
				stdout: JSON.stringify([{ title: "Existing Issue", number: 100 }]),
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(config, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toEqual([]);
		});

		it("duplicateCheckEnabled=falseの時、重複チェックはスキップされる", async () => {
			const noDuplicateConfig: IssueGeneratorConfig = {
				...config,
				duplicateCheckEnabled: false,
			};

			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Existing Issue",
					description: "This already exists",
					priority: "high",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/repo/issues/125",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(noDuplicateConfig, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toHaveLength(1);
		});

		it("enabled=falseの時、空配列を返す", async () => {
			const disabledConfig: IssueGeneratorConfig = { ...config, enabled: false };
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Test",
					description: "Test",
					priority: "high",
					relatedFiles: [],
				},
			];

			const generator = new IssueGenerator(disabledConfig, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toEqual([]);
		});

		it("gh CLIが利用不可の場合、空配列を返す", async () => {
			mockExecutor.setMockResult("--version", {
				stdout: "",
				stderr: "command not found",
				exitCode: 1,
			});

			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Test",
					description: "Test",
					priority: "high",
					relatedFiles: [],
				},
			];

			const generator = new IssueGenerator(config, mockExecutor);
			const result = await generator.createIssues(suggestions);

			expect(result).toEqual([]);
		});

		it("repository指定時、--repoオプションが追加される", async () => {
			const repoConfig: IssueGeneratorConfig = {
				...config,
				repository: "owner/other-repo",
			};

			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Test Issue",
					description: "Test description",
					priority: "high",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list (重複チェック)
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/other-repo/issues/1",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(repoConfig, mockExecutor);
			await generator.createIssues(suggestions);

			// --repoオプションが含まれているか確認
			const createCall = mockExecutor.spawnCalls.find(
				(call) => call.args.includes("create") && call.args.includes("--repo")
			);
			expect(createCall).toBeDefined();
			expect(createCall?.args).toContain("owner/other-repo");
		});

		it("Issue作成失敗時、エラーをスローせず次の提案へ続行", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Failing Issue",
					description: "This will fail",
					priority: "high",
					relatedFiles: [],
				},
				{
					title: "Successful Issue",
					description: "This will succeed",
					priority: "high",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list (重複チェック - 両方)
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// 1つ目は失敗、2つ目は成功を設定（順序重要）
			let createCallCount = 0;
			const originalSpawn = mockExecutor.spawn.bind(mockExecutor);
			mockExecutor.spawn = async (command: string, args: string[], options?: SpawnOptions) => {
				if (args.includes("create")) {
					createCallCount++;
					if (createCallCount === 1) {
						return { stdout: "", stderr: "API error", exitCode: 1 };
					}
					return { stdout: "https://github.com/owner/repo/issues/200", stderr: "", exitCode: 0 };
				}
				return originalSpawn(command, args, options);
			};

			const generator = new IssueGenerator(config, mockExecutor);
			const result = await generator.createIssues(suggestions);

			// 2つ目のIssueのみ作成されている
			expect(result).toHaveLength(1);
			expect(result[0]).toBe("https://github.com/owner/repo/issues/200");
		});
	});

	describe("buildIssueBody()", () => {
		it("提案内容からIssue本文を生成する", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Test Issue",
					description: "Test description\nwith multiple lines",
					priority: "high",
					relatedFiles: ["src/file1.ts", "src/file2.ts"],
					category: "refactoring",
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list (重複チェック)
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/repo/issues/300",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(config, mockExecutor);
			await generator.createIssues(suggestions);

			// --body-fileオプションが使用されているか確認
			const createCall = mockExecutor.spawnCalls.find((call) => call.args.includes("--body-file"));
			expect(createCall).toBeDefined();
		});
	});

	describe("buildLabels()", () => {
		it("設定ラベルと優先度ラベルが付与される", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Test Issue",
					description: "Test description",
					priority: "high",
					relatedFiles: [],
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/repo/issues/400",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(config, mockExecutor);
			await generator.createIssues(suggestions);

			// --labelオプションの値を確認
			const createCall = mockExecutor.spawnCalls.find((call) => call.args.includes("--label"));
			expect(createCall).toBeDefined();

			const labelIndex = createCall?.args.indexOf("--label");
			if (labelIndex !== undefined && labelIndex !== -1 && createCall) {
				const labels = createCall.args[labelIndex + 1];
				expect(labels).toContain("auto-generated");
				expect(labels).toContain("improvement");
				expect(labels).toContain("priority:high");
			}
		});

		it("カテゴリラベルが付与される", async () => {
			const suggestions: ImprovementSuggestion[] = [
				{
					title: "Test Issue",
					description: "Test description",
					priority: "high",
					relatedFiles: [],
					category: "security",
				},
			];

			// gh --version
			mockExecutor.setMockResult("--version", {
				stdout: "gh version 2.40.0",
				stderr: "",
				exitCode: 0,
			});

			// gh issue list
			mockExecutor.setMockResult("issue list", {
				stdout: "[]",
				stderr: "",
				exitCode: 0,
			});

			// gh issue create
			mockExecutor.setMockResult("issue create", {
				stdout: "https://github.com/owner/repo/issues/500",
				stderr: "",
				exitCode: 0,
			});

			const generator = new IssueGenerator(config, mockExecutor);
			await generator.createIssues(suggestions);

			// --labelオプションの値を確認
			const createCall = mockExecutor.spawnCalls.find((call) => call.args.includes("--label"));
			const labelIndex = createCall?.args.indexOf("--label");
			if (labelIndex !== undefined && labelIndex !== -1 && createCall) {
				const labels = createCall.args[labelIndex + 1];
				expect(labels).toContain("category:security");
			}
		});
	});
});
