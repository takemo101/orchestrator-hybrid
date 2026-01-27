import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { HybridEnvironmentError } from "../core/errors";
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
		it("パターンA: ハイブリッド環境（worktree + container-use）を構築できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: { type: "container-use" },
			};

			const cuExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
					if (command === "cu" && args.includes("env") && args.includes("create")) {
						return { stdout: "env-abc-123", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, cuExecutor);

			const result = await builder.buildEnvironment(42);

			expect(result.type).toBe("hybrid");
			expect(result.issueNumber).toBe(42);
			expect(result.environmentType).toBe("container-use");
			expect(result.environmentId).toBe("env-abc-123");
			expect(result.worktree).toBeDefined();
			expect(result.worktree?.issueNumber).toBe(42);
			expect(result.workingDirectory).toContain(".worktrees/issue-42");
		});

		it("パターンB: ハイブリッド環境（worktree + docker）を構築できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: {
					type: "docker",
					docker: { image: "node:20-alpine", network: "none", timeout: 300 },
				},
			};

			const dockerExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
					if (command === "docker" && args.includes("run")) {
						return { stdout: "container-xyz-789", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(
				config,
				worktreeManager,
				tempDir,
				dockerExecutor,
			);

			const result = await builder.buildEnvironment(43);

			expect(result.type).toBe("hybrid");
			expect(result.issueNumber).toBe(43);
			expect(result.environmentType).toBe("docker");
			expect(result.environmentId).toBe("container-xyz-789");
			expect(result.worktree).toBeDefined();
		});

		it("パターンC: worktreeのみ構築（ホスト実行）", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: { type: "host" },
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, mockExecutor);

			const result = await builder.buildEnvironment(44);

			expect(result.type).toBe("worktree-only");
			expect(result.issueNumber).toBe(44);
			expect(result.environmentType).toBe("host");
			expect(result.environmentId).toBeUndefined();
			expect(result.worktree).toBeDefined();
			expect(result.workingDirectory).toContain(".worktrees/issue-44");
		});

		it("パターンD: container-useのみ構築（worktree無効）", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: { ...defaultWorktreeConfig, enabled: false },
				sandbox: { type: "container-use" },
			};

			const cuExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
					if (command === "cu" && args.includes("env") && args.includes("create")) {
						return { stdout: "env-only-456", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const worktreeManager = new WorktreeManager(
				{ ...defaultWorktreeConfig, enabled: false },
				tempDir,
				mockExecutor,
			);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, cuExecutor);

			const result = await builder.buildEnvironment(45);

			expect(result.type).toBe("container-only");
			expect(result.issueNumber).toBe(45);
			expect(result.environmentType).toBe("container-use");
			expect(result.environmentId).toBe("env-only-456");
			expect(result.worktree).toBeUndefined();
			expect(result.workingDirectory).toBe(tempDir);
		});

		it("パターンF: ホスト環境構築（worktree無効 & host）", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: { ...defaultWorktreeConfig, enabled: false },
				sandbox: { type: "host" },
			};

			const worktreeManager = new WorktreeManager(
				{ ...defaultWorktreeConfig, enabled: false },
				tempDir,
				mockExecutor,
			);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, mockExecutor);

			const result = await builder.buildEnvironment(46);

			expect(result.type).toBe("host");
			expect(result.issueNumber).toBe(46);
			expect(result.environmentType).toBe("host");
			expect(result.environmentId).toBeUndefined();
			expect(result.worktree).toBeUndefined();
			expect(result.workingDirectory).toBe(tempDir);
		});

		it("container-use作成失敗時にエラーをスローする", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: { type: "container-use" },
			};

			const failingExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, _args: string[]): Promise<ProcessResult> => {
					if (command === "cu") {
						return { stdout: "", stderr: "connection refused", exitCode: 1 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(
				config,
				worktreeManager,
				tempDir,
				failingExecutor,
			);

			await expect(builder.buildEnvironment(47)).rejects.toThrow(HybridEnvironmentError);
			await expect(builder.buildEnvironment(47)).rejects.toThrow(/container-use環境作成失敗/);
		});

		it("docker起動失敗時にエラーをスローする", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: {
					type: "docker",
					docker: { image: "node:20-alpine", network: "none", timeout: 300 },
				},
			};

			const failingExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, _args: string[]): Promise<ProcessResult> => {
					if (command === "docker") {
						return { stdout: "", stderr: "image not found", exitCode: 1 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(
				config,
				worktreeManager,
				tempDir,
				failingExecutor,
			);

			await expect(builder.buildEnvironment(48)).rejects.toThrow(HybridEnvironmentError);
			await expect(builder.buildEnvironment(48)).rejects.toThrow(/Docker環境作成失敗/);
		});
	});

	describe("destroyEnvironment", () => {
		it("ハイブリッド環境（worktree + container-use）を削除できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: { type: "container-use" },
			};

			const cuExecutor: MockProcessExecutor = {
				execute: mock(async (command: string, args: string[]): Promise<ProcessResult> => {
					if (command === "cu" && args.includes("env") && args.includes("create")) {
						return { stdout: "env-to-delete", stderr: "", exitCode: 0 };
					}
					return { stdout: "", stderr: "", exitCode: 0 };
				}),
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, cuExecutor);

			await builder.buildEnvironment(49);
			await builder.destroyEnvironment(49);

			const worktree = await worktreeManager.getWorktree(49);
			expect(worktree).toBeNull();
		});

		it("存在しない環境の削除は何もしない", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: { type: "host" },
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, mockExecutor);

			await expect(builder.destroyEnvironment(999)).resolves.toBeUndefined();
		});
	});

	describe("並列環境構築", () => {
		it("複数ハイブリッド環境を並列に構築できる", async () => {
			const config: HybridEnvironmentBuilderConfig = {
				worktree: defaultWorktreeConfig,
				sandbox: { type: "host" },
			};

			const worktreeManager = new WorktreeManager(defaultWorktreeConfig, tempDir, mockExecutor);
			const builder = new HybridEnvironmentBuilder(config, worktreeManager, tempDir, mockExecutor);

			const results = await Promise.all([
				builder.buildEnvironment(51),
				builder.buildEnvironment(52),
				builder.buildEnvironment(53),
			]);

			expect(results).toHaveLength(3);
			expect(results.map((r) => r.issueNumber).sort()).toEqual([51, 52, 53]);
			expect(results.every((r) => r.type === "worktree-only")).toBe(true);
		});
	});
});
