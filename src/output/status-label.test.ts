import { describe, expect, mock, spyOn, test } from "bun:test";
import { type CommandExecutor, STATUS_COLORS, StatusLabelManager } from "./status-label.js";

function createMockExecutor(
	overrides: Partial<Record<string, { exitCode: number; stdout: string; stderr: string }>> = {},
): CommandExecutor & { calls: Array<{ command: string; args: string[] }> } {
	const calls: Array<{ command: string; args: string[] }> = [];

	return {
		calls,
		exec: mock(async (command: string, args: string[]) => {
			calls.push({ command, args });

			if (args.includes("label") && args.includes("list")) {
				return overrides["label list"] ?? { exitCode: 0, stdout: "[]", stderr: "" };
			}

			const key = `${command} ${args.join(" ")}`;
			return overrides[key] ?? { exitCode: 0, stdout: "", stderr: "" };
		}),
	};
}

describe("StatusLabelManager", () => {
	describe("ensureLabelsExist", () => {
		test("ラベルが存在しない場合、全ラベルを作成する", async () => {
			const executor = createMockExecutor({
				"label list": { exitCode: 0, stdout: "[]", stderr: "" },
			});
			const manager = new StatusLabelManager(executor);

			await manager.ensureLabelsExist();

			const listCalls = executor.calls.filter(
				(c) => c.args.includes("label") && c.args.includes("list"),
			);
			expect(listCalls).toHaveLength(1);

			const createCalls = executor.calls.filter(
				(c) => c.args.includes("label") && c.args.includes("create"),
			);
			expect(createCalls).toHaveLength(Object.keys(STATUS_COLORS).length);

			const queuedCall = createCalls.find((c) => c.args.includes("orch:queued"));
			expect(queuedCall).toBeDefined();
			expect(queuedCall?.args).toContain(STATUS_COLORS.queued);
		});

		test("既存ラベルがある場合、不足分のみ作成する", async () => {
			const executor = createMockExecutor({
				"label list": {
					exitCode: 0,
					stdout: JSON.stringify([{ name: "orch:queued" }, { name: "orch:running" }]),
					stderr: "",
				},
			});
			const manager = new StatusLabelManager(executor);

			await manager.ensureLabelsExist();

			const createCalls = executor.calls.filter(
				(c) => c.args.includes("label") && c.args.includes("create"),
			);
			expect(createCalls).toHaveLength(Object.keys(STATUS_COLORS).length - 2);

			const queuedCall = createCalls.find((c) => c.args.includes("orch:queued"));
			expect(queuedCall).toBeUndefined();
		});

		test("カスタムプレフィックスでラベルを作成する", async () => {
			const executor = createMockExecutor();
			const manager = new StatusLabelManager(executor, "myapp");

			await manager.ensureLabelsExist();

			const createCalls = executor.calls.filter(
				(c) => c.args.includes("label") && c.args.includes("create"),
			);
			const queuedCall = createCalls.find((c) => c.args.includes("myapp:queued"));
			expect(queuedCall).toBeDefined();
		});
	});

	describe("syncStatus", () => {
		test("新しいステータスラベルを付与する", async () => {
			const executor = createMockExecutor();
			const manager = new StatusLabelManager(executor);

			await manager.syncStatus(42, "running");

			const addCalls = executor.calls.filter((c) => c.args.includes("--add-label"));
			expect(addCalls).toHaveLength(1);
			expect(addCalls[0].args).toContain("orch:running");
			expect(addCalls[0].args).toContain("42");
		});

		test("排他的ステータス更新時、他の排他ステータスを削除する", async () => {
			const executor = createMockExecutor();
			const manager = new StatusLabelManager(executor);

			await manager.syncStatus(42, "completed");

			const removeCalls = executor.calls.filter((c) => c.args.includes("--remove-label"));
			expect(removeCalls.length).toBe(4);
			expect(removeCalls.some((c) => c.args.includes("orch:queued"))).toBe(true);
			expect(removeCalls.some((c) => c.args.includes("orch:running"))).toBe(true);
			expect(removeCalls.some((c) => c.args.includes("orch:failed"))).toBe(true);
			expect(removeCalls.some((c) => c.args.includes("orch:blocked"))).toBe(true);
			expect(removeCalls.some((c) => c.args.includes("orch:completed"))).toBe(false);
		});

		test("pr-created/mergedは排他対象外（他ステータスを削除しない）", async () => {
			const executor = createMockExecutor();
			const manager = new StatusLabelManager(executor);

			await manager.syncStatus(42, "pr-created");

			const removeCalls = executor.calls.filter((c) => c.args.includes("--remove-label"));
			expect(removeCalls).toHaveLength(0);

			const addCalls = executor.calls.filter((c) => c.args.includes("--add-label"));
			expect(addCalls).toHaveLength(1);
			expect(addCalls[0].args).toContain("orch:pr-created");
		});
	});

	describe("removeStatusLabels", () => {
		test("全てのステータスラベルを削除する", async () => {
			const executor = createMockExecutor();
			const manager = new StatusLabelManager(executor);

			await manager.removeStatusLabels(42);

			const removeCalls = executor.calls.filter((c) => c.args.includes("--remove-label"));
			expect(removeCalls).toHaveLength(Object.keys(STATUS_COLORS).length);
		});
	});

	describe("エラーハンドリング", () => {
		test("label listが失敗した場合、GitHubErrorをスローする", async () => {
			const executor = createMockExecutor({
				"label list": { exitCode: 1, stdout: "", stderr: "API error" },
			});
			const manager = new StatusLabelManager(executor);

			await expect(manager.ensureLabelsExist()).rejects.toThrow("Failed to list labels");
		});

		test("label createが失敗してもエラーにならない（警告のみ）", async () => {
			const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
			const calls: Array<{ command: string; args: string[] }> = [];
			const executor: CommandExecutor & { calls: Array<{ command: string; args: string[] }> } = {
				calls,
				exec: mock(async (_command: string, args: string[]) => {
					calls.push({ command: _command, args });
					if (args.includes("create")) {
						return { exitCode: 1, stdout: "", stderr: "Permission denied" };
					}
					return { exitCode: 0, stdout: "[]", stderr: "" };
				}),
			};
			const manager = new StatusLabelManager(executor);

			await manager.ensureLabelsExist();
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});

		test("ラベル付与が失敗してもエラーにならない（警告のみ）", async () => {
			const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
			const calls: Array<{ command: string; args: string[] }> = [];
			const executor: CommandExecutor & { calls: Array<{ command: string; args: string[] }> } = {
				calls,
				exec: mock(async (_command: string, args: string[]) => {
					calls.push({ command: _command, args });
					if (args.includes("--add-label")) {
						return { exitCode: 1, stdout: "", stderr: "Issue not found" };
					}
					return { exitCode: 0, stdout: "", stderr: "" };
				}),
			};
			const manager = new StatusLabelManager(executor);

			await manager.syncStatus(999, "running");
			expect(warnSpy).toHaveBeenCalled();
			warnSpy.mockRestore();
		});
	});
});
