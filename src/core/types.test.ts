import { describe, expect, test } from "bun:test";
import {
	type HatDefinition,
	HatDefinitionSchema,
	type IssueInfo,
	IssueInfoSchema,
	type OrchestratorConfig,
	OrchestratorConfigSchema,
	type SessionMeta,
	SessionMetaSchema,
} from "./types.js";

describe("types", () => {
	describe("OrchestratorConfigSchema", () => {
		test("should parse minimal config with defaults", () => {
			const config = OrchestratorConfigSchema.parse({});
			expect(config.backend).toBe("claude");
			expect(config.auto).toBe(false);
			expect(config.create_pr).toBe(false);
			expect(config.max_iterations).toBe(100);
			expect(config.preset).toBe("simple");
		});

		test("should parse full config", () => {
			const config = OrchestratorConfigSchema.parse({
				backend: "opencode",
				auto: true,
				create_pr: true,
				max_iterations: 50,
				preset: "tdd",
				worktree: {
					enabled: true,
					base_dir: ".wt",
					copy_files: [".env", ".envrc"],
				},
				session: {
					manager: "tmux",
					prefix: "myorch",
					capture_interval: 1000,
				},
			});
			expect(config.backend).toBe("opencode");
			expect(config.auto).toBe(true);
			expect(config.create_pr).toBe(true);
			expect(config.max_iterations).toBe(50);
			expect(config.preset).toBe("tdd");
			expect(config.worktree.enabled).toBe(true);
			expect(config.worktree.base_dir).toBe(".wt");
			expect(config.worktree.copy_files).toEqual([".env", ".envrc"]);
			expect(config.session.manager).toBe("tmux");
			expect(config.session.prefix).toBe("myorch");
			expect(config.session.capture_interval).toBe(1000);
		});

		test("should apply worktree defaults", () => {
			const config = OrchestratorConfigSchema.parse({});
			expect(config.worktree.enabled).toBe(true);
			expect(config.worktree.base_dir).toBe(".worktrees");
			expect(config.worktree.copy_files).toEqual([".env"]);
		});

		test("should apply session defaults", () => {
			const config = OrchestratorConfigSchema.parse({});
			expect(config.session.manager).toBe("auto");
			expect(config.session.prefix).toBe("orch");
			expect(config.session.capture_interval).toBe(500);
		});

		test("should reject invalid backend", () => {
			expect(() => OrchestratorConfigSchema.parse({ backend: "invalid" })).toThrow();
		});

		test("should reject invalid preset", () => {
			expect(() => OrchestratorConfigSchema.parse({ preset: "unknown" })).toThrow();
		});

		test("should reject invalid session manager", () => {
			expect(() =>
				OrchestratorConfigSchema.parse({
					session: { manager: "invalid" },
				}),
			).toThrow();
		});

		test("should reject negative max_iterations", () => {
			expect(() => OrchestratorConfigSchema.parse({ max_iterations: -1 })).toThrow();
		});
	});

	describe("IssueInfoSchema", () => {
		test("should parse valid issue info", () => {
			const issue = IssueInfoSchema.parse({
				number: 42,
				title: "Add auth feature",
				body: "We need authentication",
				labels: ["enhancement", "v3.0.0"],
			});
			expect(issue.number).toBe(42);
			expect(issue.title).toBe("Add auth feature");
			expect(issue.body).toBe("We need authentication");
			expect(issue.labels).toEqual(["enhancement", "v3.0.0"]);
		});

		test("should parse issue with empty body", () => {
			const issue = IssueInfoSchema.parse({
				number: 1,
				title: "Test",
				body: "",
				labels: [],
			});
			expect(issue.body).toBe("");
		});

		test("should reject missing required fields", () => {
			expect(() => IssueInfoSchema.parse({})).toThrow();
			expect(() => IssueInfoSchema.parse({ number: 1 })).toThrow();
		});
	});

	describe("SessionMetaSchema", () => {
		test("should parse valid session metadata", () => {
			const meta = SessionMetaSchema.parse({
				id: "42",
				command: "claude",
				args: ["--prompt", "test"],
				startedAt: "2026-01-28T10:30:00Z",
				status: "running",
				exitCode: null,
				pid: 12345,
			});
			expect(meta.id).toBe("42");
			expect(meta.command).toBe("claude");
			expect(meta.args).toEqual(["--prompt", "test"]);
			expect(meta.status).toBe("running");
			expect(meta.exitCode).toBeNull();
			expect(meta.pid).toBe(12345);
		});

		test("should parse completed session", () => {
			const meta = SessionMetaSchema.parse({
				id: "42",
				command: "claude",
				args: [],
				startedAt: "2026-01-28T10:30:00Z",
				status: "completed",
				exitCode: 0,
				pid: 12345,
			});
			expect(meta.status).toBe("completed");
			expect(meta.exitCode).toBe(0);
		});

		test("should parse failed session", () => {
			const meta = SessionMetaSchema.parse({
				id: "42",
				command: "opencode",
				args: [],
				startedAt: "2026-01-28T10:30:00Z",
				status: "failed",
				exitCode: 1,
				pid: 99999,
			});
			expect(meta.status).toBe("failed");
			expect(meta.exitCode).toBe(1);
		});

		test("should reject invalid status", () => {
			expect(() =>
				SessionMetaSchema.parse({
					id: "1",
					command: "claude",
					args: [],
					startedAt: "2026-01-28T10:30:00Z",
					status: "invalid",
					exitCode: null,
					pid: 1,
				}),
			).toThrow();
		});
	});

	describe("HatDefinitionSchema", () => {
		test("should parse valid hat definition", () => {
			const hat = HatDefinitionSchema.parse({
				name: "Tester",
				triggers: ["task.start", "code.written"],
				publishes: ["tests.failing", "tests.passing"],
				instructions: "Write tests for the given code",
			});
			expect(hat.name).toBe("Tester");
			expect(hat.triggers).toEqual(["task.start", "code.written"]);
			expect(hat.publishes).toEqual(["tests.failing", "tests.passing"]);
			expect(hat.instructions).toBe("Write tests for the given code");
		});

		test("should reject empty name", () => {
			expect(() =>
				HatDefinitionSchema.parse({
					name: "",
					triggers: ["test"],
					publishes: ["test"],
					instructions: "do something",
				}),
			).toThrow();
		});

		test("should reject empty triggers", () => {
			expect(() =>
				HatDefinitionSchema.parse({
					name: "Test",
					triggers: [],
					publishes: ["test"],
					instructions: "do something",
				}),
			).toThrow();
		});

		test("should reject empty publishes", () => {
			expect(() =>
				HatDefinitionSchema.parse({
					name: "Test",
					triggers: ["test"],
					publishes: [],
					instructions: "do something",
				}),
			).toThrow();
		});
	});
});
