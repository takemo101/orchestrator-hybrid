import { describe, expect, mock, test } from "bun:test";
import { ApprovalGate, ApprovalGateError } from "./approval";

/**
 * ApprovalGate テスト
 *
 * 承認ゲート機能のテスト。
 * PromptFnをモックしてstdin依存を排除する。
 */

/** ユーザー入力をモックする関数を生成 */
function mockPrompt(answer: string) {
	return mock((_message: string): Promise<string> => Promise.resolve(answer));
}

/** タイムアウトをシミュレートするprompt */
function hangingPrompt() {
	return mock(
		(_message: string): Promise<string> =>
			new Promise(() => {
				/* never resolves */
			}),
	);
}

/** エラーをスローするprompt */
function failingPrompt(error: Error) {
	return mock((_message: string): Promise<string> => Promise.reject(error));
}

describe("ApprovalGate", () => {
	describe("自動承認モード (--auto)", () => {
		test("autoモードではユーザー入力なしで承認される", async () => {
			const gate = new ApprovalGate({ auto: true });
			const result = await gate.ask("pre-loop");

			expect(result.approved).toBe(true);
			expect(result.gateType).toBe("pre-loop");
			expect(result.auto).toBe(true);
		});

		test("autoモードでは全ゲートタイプで承認される", async () => {
			const gate = new ApprovalGate({ auto: true });

			const preLoop = await gate.ask("pre-loop");
			expect(preLoop.approved).toBe(true);

			const postCompletion = await gate.ask("post-completion");
			expect(postCompletion.approved).toBe(true);

			const beforePr = await gate.ask("before-pr");
			expect(beforePr.approved).toBe(true);
		});

		test("autoモードではpromptFnが呼ばれない", async () => {
			const promptFn = mockPrompt("n");
			const gate = new ApprovalGate({ auto: true, promptFn });
			await gate.ask("pre-loop");

			expect(promptFn).not.toHaveBeenCalled();
		});
	});

	describe("手動承認モード", () => {
		test("'y'入力で承認される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("y") });
			const result = await gate.ask("pre-loop");

			expect(result.approved).toBe(true);
			expect(result.auto).toBe(false);
		});

		test("'Y'入力で承認される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("Y") });
			const result = await gate.ask("post-completion");

			expect(result.approved).toBe(true);
		});

		test("空入力(Enter)で承認される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("") });
			const result = await gate.ask("before-pr");

			expect(result.approved).toBe(true);
		});

		test("空白のみの入力で承認される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("  ") });
			const result = await gate.ask("pre-loop");

			expect(result.approved).toBe(true);
		});

		test("'n'入力で拒否される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("n") });
			const result = await gate.ask("pre-loop");

			expect(result.approved).toBe(false);
			expect(result.auto).toBe(false);
		});

		test("'N'入力で拒否される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("N") });
			const result = await gate.ask("pre-loop");

			expect(result.approved).toBe(false);
		});

		test("その他の入力で拒否される", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("maybe") });
			const result = await gate.ask("pre-loop");

			expect(result.approved).toBe(false);
		});

		test("ゲートタイプが結果に含まれる", async () => {
			const gate = new ApprovalGate({ promptFn: mockPrompt("y") });

			const r1 = await gate.ask("pre-loop");
			expect(r1.gateType).toBe("pre-loop");

			const r2 = await gate.ask("post-completion");
			expect(r2.gateType).toBe("post-completion");

			const r3 = await gate.ask("before-pr");
			expect(r3.gateType).toBe("before-pr");
		});

		test("コンテキスト情報がプロンプトに含まれる", async () => {
			const promptFn = mockPrompt("y");
			const gate = new ApprovalGate({ promptFn });
			await gate.ask("pre-loop", "Issue #42: Add auth");

			const calledWith = promptFn.mock.calls[0][0];
			expect(calledWith).toContain("Pre-Loop");
			expect(calledWith).toContain("Issue #42: Add auth");
			expect(calledWith).toContain("Continue? [Y/n] >");
		});

		test("コンテキストなしでもゲートラベルがプロンプトに含まれる", async () => {
			const promptFn = mockPrompt("y");
			const gate = new ApprovalGate({ promptFn });
			await gate.ask("before-pr");

			const calledWith = promptFn.mock.calls[0][0];
			expect(calledWith).toContain("Before PR");
		});
	});

	describe("タイムアウト", () => {
		test("タイムアウト時にApprovalGateErrorをスローする", async () => {
			const gate = new ApprovalGate({
				promptFn: hangingPrompt(),
				timeoutMs: 50, // 50ms for fast test
			});

			await expect(gate.ask("pre-loop")).rejects.toThrow(ApprovalGateError);
			await expect(
				new ApprovalGate({ promptFn: hangingPrompt(), timeoutMs: 50 }).ask("pre-loop"),
			).rejects.toThrow("timed out");
		});
	});

	describe("エラーハンドリング", () => {
		test("promptFnがエラーをスローした場合ApprovalGateErrorでラップする", async () => {
			const gate = new ApprovalGate({
				promptFn: failingPrompt(new Error("stdin closed")),
			});

			await expect(gate.ask("pre-loop")).rejects.toThrow(ApprovalGateError);
		});
	});
});
