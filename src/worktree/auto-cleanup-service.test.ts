import { describe, expect, mock, test } from "bun:test";
import type { ProcessResult } from "../core/process-executor.js";
import { AutoCleanupService, type AutoCleanupServiceConfig } from "./auto-cleanup-service.js";
import type { EnvironmentMetadata, EnvironmentStateManager } from "./environment-state-manager.js";
import type { HybridEnvironmentBuilder } from "./hybrid-environment-builder.js";

// Mock executor factory
function createMockExecutor(responses: Map<string, ProcessResult>) {
	return {
		spawn: mock((_cmd: string, args: string[]) => {
			const key = args.join(" ");
			for (const [pattern, result] of responses.entries()) {
				if (key.includes(pattern)) {
					return Promise.resolve(result);
				}
			}
			return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
		}),
	};
}

// Mock EnvironmentStateManager
function createMockStateManager(metadata: EnvironmentMetadata | null) {
	return {
		getEnvironmentState: mock(() => Promise.resolve(metadata)),
		clearEnvironmentState: mock(() => Promise.resolve()),
		updateEnvironmentState: mock(() => Promise.resolve()),
	} as unknown as EnvironmentStateManager;
}

// Mock HybridEnvironmentBuilder
function createMockBuilder(
	destroyResult: { success: boolean; error?: string } = { success: true },
) {
	return {
		destroyEnvironment: mock(() => {
			if (destroyResult.success) {
				return Promise.resolve();
			}
			return Promise.reject(new Error(destroyResult.error ?? "destroy failed"));
		}),
		buildEnvironment: mock(() => Promise.resolve({})),
	} as unknown as HybridEnvironmentBuilder;
}

describe("AutoCleanupService", () => {
	const defaultConfig: AutoCleanupServiceConfig = {
		enabled: true,
		mergeCheckTimeoutSecs: 60,
		deleteBranch: true,
	};

	describe("cleanup", () => {
		test("PRマージ後にハイブリッド環境をクリーンアップできる", async () => {
			const prMergedResponse = JSON.stringify({
				state: "MERGED",
				mergedAt: "2026-01-26T10:00:00Z",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prMergedResponse, stderr: "" }],
				["worktree remove", { exitCode: 0, stdout: "", stderr: "" }],
				["branch -d", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);

			const metadata: EnvironmentMetadata = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};
			const stateManager = createMockStateManager(metadata);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(true);
			expect(result.worktreeRemoved).toBe(true);
			expect(result.branchRemoved).toBe(true);
			expect(builder.destroyEnvironment).toHaveBeenCalled();
			expect(stateManager.clearEnvironmentState).toHaveBeenCalledWith(42);
		});

		test("worktreeのみの環境をクリーンアップできる", async () => {
			const prMergedResponse = JSON.stringify({
				state: "MERGED",
				mergedAt: "2026-01-26T10:00:00Z",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prMergedResponse, stderr: "" }],
				["worktree remove", { exitCode: 0, stdout: "", stderr: "" }],
				["branch -d", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);

			const metadata: EnvironmentMetadata = {
				type: "worktree-only",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "host",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};
			const stateManager = createMockStateManager(metadata);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(true);
			expect(result.worktreeRemoved).toBe(true);
			expect(result.branchRemoved).toBe(true);
			// worktree-only ではdestroy不要
			expect(builder.destroyEnvironment).not.toHaveBeenCalled();
		});

		test("PR未マージ時はクリーンアップをスキップする", async () => {
			const prOpenResponse = JSON.stringify({
				state: "OPEN",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prOpenResponse, stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);

			const metadata: EnvironmentMetadata = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};
			const stateManager = createMockStateManager(metadata);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(false);
			expect(result.worktreeRemoved).toBe(false);
			expect(result.branchRemoved).toBe(false);
		});

		test("enabled=falseの場合は何もしない", async () => {
			const config: AutoCleanupServiceConfig = {
				...defaultConfig,
				enabled: false,
			};
			const executor = createMockExecutor(new Map());
			const stateManager = createMockStateManager(null);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(config, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(false);
			expect(executor.spawn).not.toHaveBeenCalled();
		});

		test("環境状態が存在しない場合はスキップする", async () => {
			const prMergedResponse = JSON.stringify({
				state: "MERGED",
				mergedAt: "2026-01-26T10:00:00Z",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prMergedResponse, stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);

			const stateManager = createMockStateManager(null);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(false);
		});

		test("deleteBranch=falseの場合はブランチを削除しない", async () => {
			const config: AutoCleanupServiceConfig = {
				...defaultConfig,
				deleteBranch: false,
			};
			const prMergedResponse = JSON.stringify({
				state: "MERGED",
				mergedAt: "2026-01-26T10:00:00Z",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prMergedResponse, stderr: "" }],
				["worktree remove", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);

			const metadata: EnvironmentMetadata = {
				type: "worktree-only",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "host",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};
			const stateManager = createMockStateManager(metadata);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(config, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(true);
			expect(result.worktreeRemoved).toBe(true);
			expect(result.branchRemoved).toBe(false);
		});

		test("host環境の場合はworktreeやcontainer削除をしない", async () => {
			const prMergedResponse = JSON.stringify({
				state: "MERGED",
				mergedAt: "2026-01-26T10:00:00Z",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prMergedResponse, stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);

			const metadata: EnvironmentMetadata = {
				type: "host",
				environmentType: "host",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};
			const stateManager = createMockStateManager(metadata);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.cleanup(42);

			expect(result.cleaned).toBe(true);
			expect(result.worktreeRemoved).toBe(false);
			expect(result.branchRemoved).toBe(false);
			expect(stateManager.clearEnvironmentState).toHaveBeenCalledWith(42);
		});
	});

	describe("isPRMerged", () => {
		test("マージ済みPRの場合はtrueを返す", async () => {
			const prMergedResponse = JSON.stringify({
				state: "MERGED",
				mergedAt: "2026-01-26T10:00:00Z",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prMergedResponse, stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const stateManager = createMockStateManager(null);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.isPRMerged(42);

			expect(result).toBe(true);
		});

		test("未マージPRの場合はfalseを返す", async () => {
			const prOpenResponse = JSON.stringify({
				state: "OPEN",
			});
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 0, stdout: prOpenResponse, stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const stateManager = createMockStateManager(null);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.isPRMerged(42);

			expect(result).toBe(false);
		});

		test("PRが見つからない場合はfalseを返す", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				["pr view", { exitCode: 1, stdout: "", stderr: "no pull request found" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const stateManager = createMockStateManager(null);
			const builder = createMockBuilder();

			const service = new AutoCleanupService(defaultConfig, builder, stateManager, executor);
			const result = await service.isPRMerged(42);

			expect(result).toBe(false);
		});
	});
});
