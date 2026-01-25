import { describe, expect, it } from "bun:test";
import {
	type AutoIssueConfig,
	AutoIssueConfigSchema,
	ConfigSchema,
	type LoopContext,
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

		it("containerUse設定が指定できる", () => {
			const result = SandboxConfigSchema.parse({
				containerUse: {
					image: "custom-image",
					envId: "my-env-123",
				},
			});
			expect(result.containerUse?.image).toBe("custom-image");
			expect(result.containerUse?.envId).toBe("my-env-123");
		});

		it("host設定が指定できる", () => {
			const result = SandboxConfigSchema.parse({
				host: {
					timeout: 600,
					warnOnStart: false,
				},
			});
			expect(result.host?.timeout).toBe(600);
			expect(result.host?.warnOnStart).toBe(false);
		});

		it("host設定のデフォルト値が正しい", () => {
			const result = SandboxConfigSchema.parse({
				host: {},
			});
			expect(result.host?.timeout).toBe(300);
			expect(result.host?.warnOnStart).toBe(true);
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
			expect(result.minPriority).toBe("medium");
			expect(result.labels).toEqual(["auto-generated", "improvement"]);
		});

		it("enabled=trueが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({ enabled: true });
			expect(result.enabled).toBe(true);
		});

		it("minPriority=highが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({ minPriority: "high" });
			expect(result.minPriority).toBe("high");
		});

		it("minPriority=lowが指定できる", () => {
			const result = AutoIssueConfigSchema.parse({ minPriority: "low" });
			expect(result.minPriority).toBe("low");
		});

		it("無効なminPriorityでエラーになる", () => {
			expect(() => AutoIssueConfigSchema.parse({ minPriority: "invalid" })).toThrow();
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
				minPriority: "high",
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

		it("autoIssue設定が指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				autoIssue: {
					enabled: true,
					minPriority: "high",
				},
			});
			expect(result.autoIssue?.enabled).toBe(true);
			expect(result.autoIssue?.minPriority).toBe("high");
		});

		it("autoIssue設定がオプショナル", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
			});
			expect(result.autoIssue).toBeUndefined();
		});

		it("sandbox と autoIssue 両方指定できる", () => {
			const result = ConfigSchema.parse({
				backend: { type: "claude" },
				loop: {},
				sandbox: { type: "container-use" },
				autoIssue: { enabled: false },
			});
			expect(result.sandbox?.type).toBe("container-use");
			expect(result.autoIssue?.enabled).toBe(false);
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
	});
});
