import { beforeEach, describe, expect, it, type Mock, mock } from "bun:test";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import {
	type IssueStatus,
	IssueStatusLabelManager,
	type IssueStatusLabelManagerConfig,
	STATUS_LABELS,
} from "./issue-status-label-manager.js";

/**
 * IssueStatusLabelManager テスト
 *
 * TDDで作成: Red -> Green -> Refactor
 */
describe("IssueStatusLabelManager", () => {
	let mockExecutor: ProcessExecutor;
	let spawnMock: Mock<(cmd: string, args: string[]) => Promise<ProcessResult>>;
	let defaultConfig: IssueStatusLabelManagerConfig;

	beforeEach(() => {
		spawnMock = mock(() => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }));
		mockExecutor = {
			spawn: spawnMock,
		};

		defaultConfig = {
			enabled: true,
			labelPrefix: "orch",
		};
	});

	describe("constructor", () => {
		it("プレフィックスを適用したラベル名を生成する", () => {
			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			const labels = manager.getAllLabelNames();

			expect(labels).toContain("orch:queued");
			expect(labels).toContain("orch:running");
			expect(labels).toContain("orch:completed");
			expect(labels).toContain("orch:failed");
			expect(labels).toContain("orch:blocked");
			expect(labels).toContain("orch:pr-created");
			expect(labels).toContain("orch:merged");
		});

		it("カスタムプレフィックスを適用する", () => {
			const customConfig = { ...defaultConfig, labelPrefix: "custom" };
			const manager = new IssueStatusLabelManager(customConfig, mockExecutor);
			const labels = manager.getAllLabelNames();

			expect(labels).toContain("custom:running");
			expect(labels).toContain("custom:completed");
			expect(labels).not.toContain("orch:running");
		});
	});

	describe("STATUS_LABELS", () => {
		it("すべてのステータスが定義されている", () => {
			const statuses: IssueStatus[] = [
				"queued",
				"running",
				"completed",
				"failed",
				"blocked",
				"pr-created",
				"merged",
			];

			for (const status of statuses) {
				expect(STATUS_LABELS[status]).toBeDefined();
				expect(STATUS_LABELS[status].name).toBe(status);
				expect(STATUS_LABELS[status].color).toMatch(/^[0-9a-f]{6}$/i);
				expect(STATUS_LABELS[status].description).toBeTruthy();
			}
		});
	});

	describe("initializeLabels", () => {
		it("各ラベルを作成する", async () => {
			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				if (args.includes("list")) {
					return Promise.resolve({ stdout: "[]", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
			});

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			await manager.initializeLabels();

			// ラベル数分の呼び出しがあるはず
			expect(spawnMock).toHaveBeenCalled();

			// 少なくともラベル作成が呼ばれているか確認
			const calls = spawnMock.mock.calls;
			const createCalls = calls.filter((call) => call[1].includes("create"));
			expect(createCalls.length).toBeGreaterThan(0);
		});

		it("enabled=falseの場合は何もしない", async () => {
			const disabledConfig = { ...defaultConfig, enabled: false };
			const manager = new IssueStatusLabelManager(disabledConfig, mockExecutor);

			await manager.initializeLabels();

			expect(spawnMock).not.toHaveBeenCalled();
		});

		it("既存のラベルがある場合は作成をスキップする", async () => {
			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				if (args.includes("list")) {
					return Promise.resolve({
						stdout: JSON.stringify([{ name: "orch:running" }]),
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
			});

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			await manager.initializeLabels();

			// 呼び出しが行われているはず
			expect(spawnMock).toHaveBeenCalled();
		});
	});

	describe("updateStatus", () => {
		it("既存ラベルを削除して新しいラベルを追加する", async () => {
			const spawnCalls: { cmd: string; args: string[] }[] = [];
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				spawnCalls.push({ cmd, args });

				if (args.includes("view") && args.includes("--json")) {
					return Promise.resolve({
						stdout: JSON.stringify({ labels: [{ name: "orch:running" }] }),
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
			});

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			await manager.updateStatus(42, "completed");

			// ラベル削除と追加が呼ばれているか確認
			const removeCall = spawnCalls.find((c) => c.args.includes("--remove-label"));
			const addCall = spawnCalls.find((c) => c.args.includes("--add-label"));

			expect(removeCall).toBeDefined();
			expect(addCall).toBeDefined();
			expect(addCall?.args).toContain("orch:completed");
		});

		it("enabled=falseの場合は何もしない", async () => {
			const disabledConfig = { ...defaultConfig, enabled: false };
			const manager = new IssueStatusLabelManager(disabledConfig, mockExecutor);

			await manager.updateStatus(42, "running");

			expect(spawnMock).not.toHaveBeenCalled();
		});

		it("エラー時も例外をスローしない（ベストエフォート）", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({ stdout: "", stderr: "API error", exitCode: 1 }),
			);

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);

			// 例外がスローされないことを確認
			await expect(manager.updateStatus(42, "running")).resolves.toBeUndefined();
		});

		it("すべてのステータスに対応する", async () => {
			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				if (args.includes("view")) {
					return Promise.resolve({
						stdout: JSON.stringify({ labels: [] }),
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
			});

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);

			const statuses: IssueStatus[] = [
				"queued",
				"running",
				"completed",
				"failed",
				"blocked",
				"pr-created",
				"merged",
			];

			for (const status of statuses) {
				await expect(manager.updateStatus(42, status)).resolves.toBeUndefined();
			}
		});

		it("ステータスラベルのみを削除する（他のラベルは保持）", async () => {
			const spawnCalls: { cmd: string; args: string[] }[] = [];
			spawnMock.mockImplementation((cmd: string, args: string[]) => {
				spawnCalls.push({ cmd, args });

				if (args.includes("view") && args.includes("--json")) {
					return Promise.resolve({
						stdout: JSON.stringify({
							labels: [{ name: "orch:running" }, { name: "bug" }, { name: "enhancement" }],
						}),
						stderr: "",
						exitCode: 0,
					});
				}
				return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
			});

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			await manager.updateStatus(42, "completed");

			// orch:runningは削除されるが、bugとenhancementは削除されない
			const removeCalls = spawnCalls.filter((c) => c.args.includes("--remove-label"));
			expect(removeCalls.length).toBe(1); // orch:runningのみ

			const removedLabel = removeCalls[0]?.args[removeCalls[0].args.indexOf("--remove-label") + 1];
			expect(removedLabel).toBe("orch:running");
		});
	});

	describe("getCurrentStatus", () => {
		it("現在のステータスを返す", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: JSON.stringify({ labels: [{ name: "orch:running" }] }),
					stderr: "",
					exitCode: 0,
				}),
			);

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			const status = await manager.getCurrentStatus(42);

			expect(status).toBe("running");
		});

		it("ステータスラベルがない場合はnullを返す", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: JSON.stringify({ labels: [{ name: "bug" }] }),
					stderr: "",
					exitCode: 0,
				}),
			);

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			const status = await manager.getCurrentStatus(42);

			expect(status).toBeNull();
		});

		it("enabled=falseの場合はnullを返す", async () => {
			const disabledConfig = { ...defaultConfig, enabled: false };
			const manager = new IssueStatusLabelManager(disabledConfig, mockExecutor);

			const status = await manager.getCurrentStatus(42);

			expect(status).toBeNull();
			expect(spawnMock).not.toHaveBeenCalled();
		});

		it("gh CLIエラー時はnullを返す", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: "",
					stderr: "Issue not found",
					exitCode: 1,
				}),
			);

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			const status = await manager.getCurrentStatus(42);

			expect(status).toBeNull();
		});

		it("JSON解析エラー時はnullを返す", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: "invalid json",
					stderr: "",
					exitCode: 0,
				}),
			);

			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			const status = await manager.getCurrentStatus(42);

			expect(status).toBeNull();
		});

		it("カスタムプレフィックスでも正しくステータスを取得する", async () => {
			const customConfig = { ...defaultConfig, labelPrefix: "myapp" };
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: JSON.stringify({ labels: [{ name: "myapp:completed" }] }),
					stderr: "",
					exitCode: 0,
				}),
			);

			const manager = new IssueStatusLabelManager(customConfig, mockExecutor);
			const status = await manager.getCurrentStatus(42);

			expect(status).toBe("completed");
		});
	});

	describe("getAllLabelNames", () => {
		it("すべてのラベル名を返す", () => {
			const manager = new IssueStatusLabelManager(defaultConfig, mockExecutor);
			const labels = manager.getAllLabelNames();

			expect(labels.length).toBe(7); // 7つのステータス
			expect(labels).toEqual(
				expect.arrayContaining([
					"orch:queued",
					"orch:running",
					"orch:completed",
					"orch:failed",
					"orch:blocked",
					"orch:pr-created",
					"orch:merged",
				]),
			);
		});
	});
});
