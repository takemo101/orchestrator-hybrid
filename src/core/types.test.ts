import { describe, expect, it } from "bun:test";
import {
	type AutoIssueConfig,
	AutoIssueConfigSchema,
	ConfigSchema,
	type LoopContext,
	LoopSchema,
	LoopStateSchema,
	type PRConfig,
	PRConfigSchema,
	type SandboxConfig,
	SandboxConfigSchema,
	StateConfigSchema,
} from "./types.js";

describe("types.ts 拡張", () => {
	describe("SandboxConfigSchema", () => {
		it("デフォルト値が正しく設定される", () => {
			const result = SandboxConfigSchema.parse({});
			expect(result.type).toBe("container-use");
		});

		it("type=dockerが指定できる", () => {
			const result = SandboxConfigSchema.parse({ type: "docker" });
			expect(result.type).toBe("docker");
		});

		it("type=hostが指定できる", () => {
			const result = SandboxConfigSchema.parse({ type: "host" });
			expect(result.type).toBe("host");
		});

		it("type=container-useが指定できる", () => {
			const result = SandboxConfigSchema.parse({ type: "container-use" });
			expect(result.type).toBe("container-use");
		});

		it("無効なtypeでエラーになる", () => {
			expect(() => SandboxConfigSchema.parse({ type: "invalid" })).toThrow();
		});

		it("fallbackが指定できる", () => {
			const result = SandboxConfigSchema.parse({
				type: "docker",
				fallback: "host",
			});
			expect(result.fallback).toBe("host");
		});

		it("docker設定が指定できる", () => {
			const result = SandboxConfigSchema.parse({
				docker: {
					image: "node:20-alpine",
					network: "none",
					timeout: 600,
				},
			});
			expect(result.docker?.image).toBe("node:20-alpine");
			expect(result.docker?.network).toBe("none");
			expect(result.docker?.timeout).toBe(600);
		});

		it("docker設定のデフォルト値が正しい", () => {
			const result = SandboxConfigSchema.parse({
				docker: {},
			});
			expect(result.docker?.image).toBe("node:20-alpine");
			expect(result.docker?.timeout).toBe(300);
		});

		it("container_use設定が指定できる", () => {
			const result = SandboxConfigSchema.parse({
				container_use: {
					image: "custom-image",
					env_id: "my-env-123",
				},
			});
			expect(result.container_use?.image).toBe("custom-image");
			expect(result.container_use?.env_id).toBe("my-env-123");
		});

		it("host設定が指定できる", () => {
			const result = SandboxConfigSchema.parse({
				host: {
					timeout: 600,
					warn_on_start: false,
				},
			});
			expect(result.host?.timeout).toBe(600);
			expect(result.host?.warn_on_start).toBe(false);
		});

		it("host設定のデフォルト値が正しい", () => {
			const result = SandboxConfigSchema.parse({
				host: {},
			});
			expect(result.host?.timeout).toBe(300);
			expect(result.host?.warn_on_start).toBe(true);
		});

		it("SandboxConfig型が正しく推論される", () => {
			const config: SandboxConfig = {
				type: "docker",
				fallback: "host",
				docker: { image: "node:20", timeout: 300 },
			};
			expect(config.type).toBe("docker");
		});
	});

	describe("AutoIssueConfigSchema", () => {
		it("デフォルト値が正しく設定される", () => {
			const result = AutoIssueConfigSchema.parse({});
			expect(result.enabled).toBe(false);
			expect(result.min_priority).toBe("medium");
			expect(result.labels).toEqual(["auto-generated", "improvement"]);
		});

		it("enabled=trueが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({ enabled: true });
			expect(result.enabled).toBe(true);
		});

		it("min_priority=highが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({ min_priority: "high" });
			expect(result.min_priority).toBe("high");
		});

		it("min_priority=lowが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({ min_priority: "low" });
			expect(result.min_priority).toBe("low");
		});

		it("無効なmin_priorityでエラーになる", () => {
			expect(() => AutoIssueConfigSchema.parse({ min_priority: "invalid" })).toThrow();
		});

		it("カスタムlabelsが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({
				labels: ["bug", "critical"],
			});
			expect(result.labels).toEqual(["bug", "critical"]);
		});

		it("repositoryが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({
				repository: "owner/repo",
			});
			expect(result.repository).toBe("owner/repo");
		});

		it("AutoIssueConfig型が正しく推論される", () => {
			const config: AutoIssueConfig = {
				enabled: true,
				min_priority: "high",
				labels: ["auto"],
				repository: "owner/repo",
			};
			expect(config.enabled).toBe(true);
		});
	});

	describe("ConfigSchema 拡張", () => {
		it("sandbox設定が指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				sandbox: {
					type: "docker",
					fallback: "host",
				},
			});
			expect(result.sandbox?.type).toBe("docker");
			expect(result.sandbox?.fallback).toBe("host");
		});

		it("sandbox設定がオプショナル", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
			});
			expect(result.sandbox).toBeUndefined();
		});

		it("auto_issue設定が指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				auto_issue: {
					enabled: true,
					min_priority: "high",
				},
			});
			expect(result.auto_issue?.enabled).toBe(true);
			expect(result.auto_issue?.min_priority).toBe("high");
		});

		it("auto_issue設定がオプショナル", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
			});
			expect(result.auto_issue).toBeUndefined();
		});

		it("sandbox と auto_issue 両方指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				sandbox: { type: "container-use" },
				auto_issue: { enabled: false },
			});
			expect(result.sandbox?.type).toBe("container-use");
			expect(result.auto_issue?.enabled).toBe(false);
		});
	});

	describe("PRConfigSchema", () => {
		it("デフォルト値が正しく設定される", () => {
			const result = PRConfigSchema.parse({});
			expect(result.auto_merge).toBe(false);
			expect(result.merge_method).toBe("squash");
			expect(result.delete_branch).toBe(true);
			expect(result.ci_timeout_secs).toBe(600);
		});

		it("auto_merge=trueが指定できる", () => {
			const result = PRConfigSchema.parse({ auto_merge: true });
			expect(result.auto_merge).toBe(true);
		});

		it("merge_method=mergeが指定できる", () => {
			const result = PRConfigSchema.parse({ merge_method: "merge" });
			expect(result.merge_method).toBe("merge");
		});

		it("merge_method=rebaseが指定できる", () => {
			const result = PRConfigSchema.parse({ merge_method: "rebase" });
			expect(result.merge_method).toBe("rebase");
		});

		it("無効なmerge_methodでエラーになる", () => {
			expect(() => PRConfigSchema.parse({ merge_method: "invalid" })).toThrow();
		});

		it("ci_timeout_secsの最小値は60", () => {
			expect(() => PRConfigSchema.parse({ ci_timeout_secs: 30 })).toThrow();
		});

		it("ci_timeout_secsの最大値は3600", () => {
			expect(() => PRConfigSchema.parse({ ci_timeout_secs: 5000 })).toThrow();
		});

		it("ci_timeout_secsの有効範囲内の値が指定できる", () => {
			const result = PRConfigSchema.parse({ ci_timeout_secs: 300 });
			expect(result.ci_timeout_secs).toBe(300);
		});

		it("delete_branch=falseが指定できる", () => {
			const result = PRConfigSchema.parse({ delete_branch: false });
			expect(result.delete_branch).toBe(false);
		});

		it("PRConfig型が正しく推論される", () => {
			const config: PRConfig = {
				auto_merge: true,
				merge_method: "squash",
				delete_branch: true,
				ci_timeout_secs: 600,
			};
			expect(config.auto_merge).toBe(true);
		});
	});

	describe("StateConfigSchema", () => {
		it("デフォルト値が正しく設定される", () => {
			const result = StateConfigSchema.parse({});
			expect(result.use_github_labels).toBe(true);
			expect(result.use_scratchpad).toBe(true);
			expect(result.scratchpad_path).toBe(".agent/scratchpad.md");
			expect(result.label_prefix).toBe("orch");
		});

		it("label_prefixが指定できる", () => {
			const result = StateConfigSchema.parse({ label_prefix: "myapp" });
			expect(result.label_prefix).toBe("myapp");
		});

		it("label_prefixの最小長は1文字", () => {
			expect(() => StateConfigSchema.parse({ label_prefix: "" })).toThrow();
		});

		it("label_prefixの最大長は20文字", () => {
			expect(() => StateConfigSchema.parse({ label_prefix: "a".repeat(21) })).toThrow();
		});

		it("label_prefix=20文字はOK", () => {
			const result = StateConfigSchema.parse({ label_prefix: "a".repeat(20) });
			expect(result.label_prefix.length).toBe(20);
		});
	});

	describe("LoopContext 拡張", () => {
		it("taskIdフィールドが追加されている", () => {
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
				taskId: "task-1737705600000-42",
				logDir: ".agent/task-1737705600000-42",
			};
			expect(context.taskId).toBe("task-1737705600000-42");
		});

		it("logDirフィールドが追加されている", () => {
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
				taskId: "task-123",
				logDir: ".agent/task-123",
			};
			expect(context.logDir).toBe(".agent/task-123");
		});

		it("taskIdとlogDirがオプショナルである", () => {
			// 既存の使用方法との互換性のため、オプショナルにする
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
			};
			expect(context.taskId).toBeUndefined();
			expect(context.logDir).toBeUndefined();
		});

		it("prConfigフィールドが追加されている", () => {
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
				prConfig: {
					auto_merge: true,
					merge_method: "squash",
					delete_branch: true,
					ci_timeout_secs: 600,
				},
			};
			expect(context.prConfig?.auto_merge).toBe(true);
		});

		it("resolveDepsフィールドが追加されている", () => {
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
				resolveDeps: true,
			};
			expect(context.resolveDeps).toBe(true);
		});

		it("ignoreDepsフィールドが追加されている", () => {
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
				ignoreDeps: true,
			};
			expect(context.ignoreDeps).toBe(true);
		});

		it("v1.3.0新規フィールドがすべてオプショナルである", () => {
			const context: LoopContext = {
				issue: {
					number: 1,
					title: "Test",
					body: "Test body",
					labels: [],
					state: "open",
				},
				iteration: 0,
				maxIterations: 10,
				scratchpadPath: ".agent/scratchpad.md",
				promptPath: ".agent/PROMPT.md",
				completionPromise: "LOOP_COMPLETE",
				autoMode: false,
				createPR: false,
				draftPR: false,
				useContainer: false,
				generateReport: false,
				reportPath: ".agent/report.md",
			};
			expect(context.prConfig).toBeUndefined();
			expect(context.resolveDeps).toBeUndefined();
			expect(context.ignoreDeps).toBeUndefined();
		});
	});

	describe("LoopStateSchema (v1.4.0)", () => {
		it("有効なLoopStateを受け入れる", () => {
			expect(LoopStateSchema.parse("running")).toBe("running");
			expect(LoopStateSchema.parse("queued")).toBe("queued");
			expect(LoopStateSchema.parse("merging")).toBe("merging");
			expect(LoopStateSchema.parse("merged")).toBe("merged");
			expect(LoopStateSchema.parse("needs-review")).toBe("needs-review");
			expect(LoopStateSchema.parse("crashed")).toBe("crashed");
			expect(LoopStateSchema.parse("orphan")).toBe("orphan");
			expect(LoopStateSchema.parse("discarded")).toBe("discarded");
		});

		it("無効なLoopStateを拒否する", () => {
			expect(() => LoopStateSchema.parse("invalid")).toThrow();
		});
	});

	describe("LoopSchema (v1.4.0)", () => {
		it("有効なLoopオブジェクトを受け入れる", () => {
			const loop = {
				id: "orch-20260126-a3f2",
				state: "running" as const,
				worktree_path: "/tmp/worktree",
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
			const result = LoopSchema.parse(loop);
			expect(result.id).toBe(loop.id);
			expect(result.state).toBe(loop.state);
		});

		it("worktree_pathはnullを許容する", () => {
			const loop = {
				id: "orch-20260126-a3f2",
				state: "queued",
				worktree_path: null,
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
			const result = LoopSchema.parse(loop);
			expect(result.worktree_path).toBeNull();
		});

		it("必須フィールドが欠けている場合は拒否する", () => {
			const loop = {
				id: "orch-20260126-a3f2",
				state: "running",
				// worktree_path missing
				created_at: new Date().toISOString(),
				updated_at: new Date().toISOString(),
			};
			expect(() => LoopSchema.parse(loop)).toThrow();
		});
	});

	describe("ConfigSchema 拡張（v1.3.0）", () => {
		it("pr設定が指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				pr: {
					auto_merge: true,
					merge_method: "squash",
				},
			});
			expect(result.pr?.auto_merge).toBe(true);
			expect(result.pr?.merge_method).toBe("squash");
		});

		it("pr設定がオプショナル", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
			});
			expect(result.pr).toBeUndefined();
		});

		it("state.label_prefixが指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				state: {
					label_prefix: "custom",
				},
			});
			expect(result.state?.label_prefix).toBe("custom");
		});

		it("dependency.resolveが指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				dependency: {
					resolve: true,
				},
			});
			expect(result.dependency?.resolve).toBe(true);
			expect(result.dependency?.ignore).toBe(false);
		});

		it("dependency.ignoreが指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				dependency: {
					ignore: true,
				},
			});
			expect(result.dependency?.ignore).toBe(true);
			expect(result.dependency?.resolve).toBe(false);
		});

		it("dependency設定がオプショナル", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
			});
			expect(result.dependency).toBeUndefined();
		});
	});
});
