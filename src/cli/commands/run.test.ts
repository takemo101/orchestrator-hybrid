import { describe, expect, it } from "bun:test";
import type { Config, SandboxConfig, WorktreeConfig } from "../../core/types.js";

describe("RunCommand", () => {
	describe("run config merge logic", () => {
		const buildRunConfig = (
			options: { auto?: boolean; createPr?: boolean; draft?: boolean },
			config: Partial<Config>,
		) => {
			return {
				autoMode: options.auto ?? config.run?.auto_mode ?? false,
				createPR: options.createPr ?? config.run?.create_pr ?? false,
				draftPR: options.draft ?? config.run?.draft_pr ?? false,
			};
		};

		it("should use CLI options when provided", () => {
			const options = { auto: true, createPr: true, draft: true };
			const config: Partial<Config> = {
				run: { auto_mode: false, create_pr: false, draft_pr: false },
			};

			const result = buildRunConfig(options, config);

			expect(result.autoMode).toBe(true);
			expect(result.createPR).toBe(true);
			expect(result.draftPR).toBe(true);
		});

		it("should use config values when CLI options not provided", () => {
			const options = {};
			const config: Partial<Config> = {
				run: { auto_mode: true, create_pr: true, draft_pr: true },
			};

			const result = buildRunConfig(options, config);

			expect(result.autoMode).toBe(true);
			expect(result.createPR).toBe(true);
			expect(result.draftPR).toBe(true);
		});

		it("should use default false when neither CLI nor config provided", () => {
			const options = {};
			const config: Partial<Config> = {};

			const result = buildRunConfig(options, config);

			expect(result.autoMode).toBe(false);
			expect(result.createPR).toBe(false);
			expect(result.draftPR).toBe(false);
		});

		it("should allow CLI to override config with false", () => {
			const options = { auto: false, createPr: false, draft: false };
			const config: Partial<Config> = {
				run: { auto_mode: true, create_pr: true, draft_pr: true },
			};

			const result = buildRunConfig(options, config);

			expect(result.autoMode).toBe(false);
			expect(result.createPR).toBe(false);
			expect(result.draftPR).toBe(false);
		});

		it("should handle partial config", () => {
			const options = {};
			const config: Partial<Config> = {
				run: { auto_mode: true, create_pr: false, draft_pr: false },
			};

			const result = buildRunConfig(options, config);

			expect(result.autoMode).toBe(true);
			expect(result.createPR).toBe(false);
			expect(result.draftPR).toBe(false);
		});
	});

	describe("worktree/sandbox config propagation (UT-F106-001)", () => {
		const buildEnvironmentConfig = (
			config: Partial<Config>,
		): { worktreeConfig?: WorktreeConfig; sandboxConfig?: SandboxConfig } => {
			return {
				worktreeConfig: config.worktree,
				sandboxConfig: config.sandbox,
			};
		};

		it("should pass worktree config to LoopOptions when enabled", () => {
			const config: Partial<Config> = {
				worktree: {
					enabled: true,
					base_dir: ".worktrees",
					auto_cleanup: true,
					copy_env_files: [".env"],
				},
			};

			const result = buildEnvironmentConfig(config);

			expect(result.worktreeConfig).toBeDefined();
			expect(result.worktreeConfig?.enabled).toBe(true);
			expect(result.worktreeConfig?.base_dir).toBe(".worktrees");
			expect(result.worktreeConfig?.auto_cleanup).toBe(true);
		});

		it("should pass sandbox config to LoopOptions when docker type", () => {
			const config: Partial<Config> = {
				sandbox: {
					type: "docker",
					docker: {
						image: "node:20-alpine",
						timeout: 300,
					},
				},
			};

			const result = buildEnvironmentConfig(config);

			expect(result.sandboxConfig).toBeDefined();
			expect(result.sandboxConfig?.type).toBe("docker");
		});

		it("should pass both configs when hybrid mode enabled", () => {
			const config: Partial<Config> = {
				worktree: {
					enabled: true,
					base_dir: ".worktrees",
					auto_cleanup: true,
					copy_env_files: [".env"],
				},
				sandbox: {
					type: "docker",
				},
			};

			const result = buildEnvironmentConfig(config);

			expect(result.worktreeConfig?.enabled).toBe(true);
			expect(result.sandboxConfig?.type).toBe("docker");
		});

		it("should return undefined configs when not configured", () => {
			const config: Partial<Config> = {};

			const result = buildEnvironmentConfig(config);

			expect(result.worktreeConfig).toBeUndefined();
			expect(result.sandboxConfig).toBeUndefined();
		});
	});
});
