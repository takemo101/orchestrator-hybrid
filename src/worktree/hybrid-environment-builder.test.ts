import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import type { WorktreeConfig } from "../core/types";
import {
	HybridEnvironmentBuilder,
	type HybridEnvironmentBuilderConfig,
} from "./hybrid-environment-builder";
import { WorktreeManager } from "./worktree-manager";

interface ProcessResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

interface MockProcessExecutor {
	execute: (command: string, args: string[]) => Promise<ProcessResult>;
}

describe("HybridEnvironmentBuilder", () => {
	let tempDir: string;
	let mockExecutor: MockProcessExecutor;
	let defaultWorktreeConfig: WorktreeConfig;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join("/tmp", "hybrid-env-test-"));

		defaultWorktreeConfig = {
			enabled: true,
			base_dir: ".worktrees",
			auto_cleanup: true,
			copy_env_files: [".env"],
		};

		mockExecutor = {
			execute: mock(async (_command: string, _args: string[]): Promise<ProcessResult> => {
				return { stdout: "", stderr: "", exitCode: 0 };
			}),
		};
	});

	afterEach(() => {
		if (fs.existsSync(tempDir)) {
			fs.rmSync(tempDir, { recursive: true, force: true });
		}
	});

	describe("buildEnvironment", () => {
		it("worktree有効時にworktree環境を構築できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir);

			const result = await builder.buildEnvironment(44);

			expect(result.type).toBe("worktree");
			expect(result.issueNumber).toBe(44);
			expect(result.worktree).toBeDefined();
			expect(result.workingDirectory).toContain(".worktrees/issue-44");
		});

		it("worktree無効時にhost環境を返す", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: { ...defaultWorktreeConfig, enabled: false },
			};

			const worktreeManager = new WorktreeManager(
				{ ...defaultWorktreeConfig, enabled: false },
				tempDir,
				mockExecutor,
			);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir);

			const result = await builder.buildEnvironment(46);

			expect(result.type).toBe("host");
			expect(result.issueNumber).toBe(46);
			expect(result.worktree).toBeUndefined();
			expect(result.workingDirectory).toBe(tempDir);
		});
	});

	describe("destroyEnvironment", () => {
		it("worktree環境を削除できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir);

			await builder.buildEnvironment(49);
			await builder.destroyEnvironment(49);

			const worktree = await worktreeManager.getWorktree(49);
			expect(worktree).toBeNull();
		});

		it("存在しない環境の削除は何もしない", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir);

			await expect(builder.destroyEnvironment(999)).resolves.toBeUndefined();
		});
	});

	describe("並列環境構築", () => {
		it("複数worktree環境を並列に構築できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir);

			const results = await Promise.all([
				builder.buildEnvironment(51),
				builder.buildEnvironment(52),
				builder.buildEnvironment(53),
			]);

			expect(results).toHaveLength(3);
			expect(results.map((r) => r.issueNumber).sort()).toEqual([51, 52, 53]);
			expect(results.every((r) => r.type === "worktree")).toBe(true);
		});
	});
});
