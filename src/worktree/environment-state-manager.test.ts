import { describe, expect, mock, test } from "bun:test";
import type { ProcessResult } from "../core/process-executor.js";
import type { IssueStatusLabelManager } from "../output/issue-status-label-manager.js";
import {
	type EnvironmentInfo,
	type EnvironmentMetadata,
	EnvironmentStateManager,
	type EnvironmentStateManagerConfig,
} from "./environment-state-manager.js";

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

// Mock label manager factory
function createMockLabelManager() {
	return {
		updateStatus: mock(() => Promise.resolve()),
		getCurrentStatus: mock(() => Promise.resolve(null)),
		initializeLabels: mock(() => Promise.resolve()),
		getAllLabelNames: mock(() => []),
	} as unknown as IssueStatusLabelManager;
}

describe("EnvironmentStateManager", () => {
	const defaultConfig: EnvironmentStateManagerConfig = {
		enabled: true,
		useLabels: true,
		labelPrefix: "orch",
	};

	describe("updateEnvironmentState", () => {
		test("ハイブリッド環境の状態を更新できる", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				["issue view 42", { exitCode: 0, stdout: JSON.stringify({ body: "test" }), stderr: "" }],
				["issue edit 42", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			const envInfo: EnvironmentInfo = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
			};

			await manager.updateEnvironmentState(42, envInfo);

			expect(executor.spawn).toHaveBeenCalled();
			expect(labelManager.updateStatus).toHaveBeenCalledWith(42, "running");
		});

		test("worktreeのみの状態を更新できる", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				["issue view 42", { exitCode: 0, stdout: JSON.stringify({ body: "test" }), stderr: "" }],
				["issue edit 42", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			const envInfo: EnvironmentInfo = {
				type: "worktree-only",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "host",
			};

			await manager.updateEnvironmentState(42, envInfo);

			expect(executor.spawn).toHaveBeenCalled();
		});

		test("enabled=falseの場合は何もしない", async () => {
			const executor = createMockExecutor(new Map());
			const labelManager = createMockLabelManager();

			const config: EnvironmentStateManagerConfig = {
				...defaultConfig,
				enabled: false,
			};

			const manager = new EnvironmentStateManager(config, labelManager, executor);

			const envInfo: EnvironmentInfo = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
			};

			await manager.updateEnvironmentState(42, envInfo);

			expect(executor.spawn).not.toHaveBeenCalled();
		});

		test("gh issue edit失敗時はEnvironmentStateErrorをスローする", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				["issue view 42", { exitCode: 0, stdout: JSON.stringify({ body: "test" }), stderr: "" }],
				["issue edit 42", { exitCode: 1, stdout: "", stderr: "permission denied" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			const envInfo: EnvironmentInfo = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
			};

			await expect(manager.updateEnvironmentState(42, envInfo)).rejects.toThrow("環境状態更新失敗");
		});
	});

	describe("getEnvironmentState", () => {
		test("存在する環境状態を取得できる", async () => {
			const metadata: EnvironmentMetadata = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};

			// GitHub Issueのbody末尾にJSON形式でメタデータを埋め込む
			const bodyWithMetadata = `## Description\nTest\n\n<!-- ORCH_ENV_METADATA\n${JSON.stringify(metadata)}\n-->`;

			const mockResponses = new Map<string, ProcessResult>([
				[
					"issue view 42",
					{ exitCode: 0, stdout: JSON.stringify({ body: bodyWithMetadata }), stderr: "" },
				],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			const result = await manager.getEnvironmentState(42);

			expect(result).not.toBeNull();
			expect(result?.type).toBe("hybrid");
			expect(result?.environmentId).toBe("abc-123");
		});

		test("存在しない場合はnullを返す", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				[
					"issue view 42",
					{ exitCode: 0, stdout: JSON.stringify({ body: "No metadata here" }), stderr: "" },
				],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			const result = await manager.getEnvironmentState(42);

			expect(result).toBeNull();
		});

		test("enabled=falseの場合はnullを返す", async () => {
			const executor = createMockExecutor(new Map());
			const labelManager = createMockLabelManager();

			const config: EnvironmentStateManagerConfig = {
				...defaultConfig,
				enabled: false,
			};

			const manager = new EnvironmentStateManager(config, labelManager, executor);

			const result = await manager.getEnvironmentState(42);

			expect(result).toBeNull();
		});

		test("gh issue view失敗時はnullを返す", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				["issue view 42", { exitCode: 1, stdout: "", stderr: "not found" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			const result = await manager.getEnvironmentState(42);

			expect(result).toBeNull();
		});
	});

	describe("clearEnvironmentState", () => {
		test("環境状態をクリアできる", async () => {
			const metadata: EnvironmentMetadata = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
				createdAt: "2026-01-26T10:00:00Z",
				updatedAt: "2026-01-26T10:00:00Z",
			};

			const bodyWithMetadata = `## Description\nTest\n\n<!-- ORCH_ENV_METADATA\n${JSON.stringify(metadata)}\n-->`;

			const mockResponses = new Map<string, ProcessResult>([
				[
					"issue view 42",
					{ exitCode: 0, stdout: JSON.stringify({ body: bodyWithMetadata }), stderr: "" },
				],
				["issue edit 42", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			await manager.clearEnvironmentState(42);

			expect(executor.spawn).toHaveBeenCalled();
		});

		test("enabled=falseの場合は何もしない", async () => {
			const executor = createMockExecutor(new Map());
			const labelManager = createMockLabelManager();

			const config: EnvironmentStateManagerConfig = {
				...defaultConfig,
				enabled: false,
			};

			const manager = new EnvironmentStateManager(config, labelManager, executor);

			await manager.clearEnvironmentState(42);

			expect(executor.spawn).not.toHaveBeenCalled();
		});

		test("メタデータが存在しない場合も正常終了する", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				[
					"issue view 42",
					{ exitCode: 0, stdout: JSON.stringify({ body: "No metadata" }), stderr: "" },
				],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const manager = new EnvironmentStateManager(defaultConfig, labelManager, executor);

			// Should not throw
			await manager.clearEnvironmentState(42);
		});
	});

	describe("useLabels option", () => {
		test("useLabels=falseの場合はラベル更新しない", async () => {
			const mockResponses = new Map<string, ProcessResult>([
				["issue view 42", { exitCode: 0, stdout: JSON.stringify({ body: "test" }), stderr: "" }],
				["issue edit 42", { exitCode: 0, stdout: "", stderr: "" }],
			]);
			const executor = createMockExecutor(mockResponses);
			const labelManager = createMockLabelManager();

			const config: EnvironmentStateManagerConfig = {
				enabled: true,
				useLabels: false,
				labelPrefix: "orch",
			};

			const manager = new EnvironmentStateManager(config, labelManager, executor);

			const envInfo: EnvironmentInfo = {
				type: "hybrid",
				worktreePath: ".worktrees/issue-42",
				branch: "feature/issue-42",
				environmentType: "container-use",
				environmentId: "abc-123",
			};

			await manager.updateEnvironmentState(42, envInfo);

			expect(labelManager.updateStatus).not.toHaveBeenCalled();
		});
	});
});
