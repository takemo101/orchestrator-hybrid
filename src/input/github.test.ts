import { describe, expect, mock, test } from "bun:test";
import { GitHubError } from "../core/errors";
import type { IssueInfo } from "../core/types";
import { fetchIssue } from "./github";

/**
 * fetchIssue テスト
 *
 * gh issue view <number> --json title,body,labels を実行し、
 * IssueInfo型に変換して返す関数のテスト。
 * Bun.spawnをモックして外部コマンド依存を排除する。
 */

/** gh CLIが返す正常レスポンスのサンプル */
const VALID_GH_RESPONSE = JSON.stringify({
	title: "Add user authentication",
	body: "## Task\nImplement JWT-based authentication",
	labels: [
		{ name: "enhancement", color: "a2eeef", description: "New feature" },
		{ name: "priority:high", color: "d73a4a", description: "" },
	],
});

/** ラベルなしの正常レスポンス */
const NO_LABELS_RESPONSE = JSON.stringify({
	title: "Fix typo in README",
	body: "Small fix",
	labels: [],
});

/** 本文が空のレスポンス */
const EMPTY_BODY_RESPONSE = JSON.stringify({
	title: "Empty body issue",
	body: "",
	labels: [],
});

describe("fetchIssue", () => {
	test("正常系: Issue情報を取得してIssueInfo型に変換する", async () => {
		const result = await fetchIssue(42, {
			exec: mockExec(VALID_GH_RESPONSE, "", 0),
		});

		expect(result).toEqual({
			number: 42,
			title: "Add user authentication",
			body: "## Task\nImplement JWT-based authentication",
			labels: ["enhancement", "priority:high"],
		} satisfies IssueInfo);
	});

	test("正常系: ラベルなしのIssueを取得できる", async () => {
		const result = await fetchIssue(1, {
			exec: mockExec(NO_LABELS_RESPONSE, "", 0),
		});

		expect(result.labels).toEqual([]);
		expect(result.number).toBe(1);
	});

	test("正常系: 本文が空のIssueを取得できる", async () => {
		const result = await fetchIssue(99, {
			exec: mockExec(EMPTY_BODY_RESPONSE, "", 0),
		});

		expect(result.body).toBe("");
		expect(result.title).toBe("Empty body issue");
	});

	test("正常系: ghコマンドに正しい引数が渡される", async () => {
		const execFn = mockExec(VALID_GH_RESPONSE, "", 0);
		await fetchIssue(42, { exec: execFn });

		expect(execFn).toHaveBeenCalledWith([
			"gh",
			"issue",
			"view",
			"42",
			"--json",
			"title,body,labels",
		]);
	});

	test("正常系: repositoryオプション指定時に--repoフラグが付与される", async () => {
		const execFn = mockExec(VALID_GH_RESPONSE, "", 0);
		await fetchIssue(42, {
			exec: execFn,
			repository: "owner/repo",
		});

		expect(execFn).toHaveBeenCalledWith([
			"gh",
			"issue",
			"view",
			"42",
			"--json",
			"title,body,labels",
			"--repo",
			"owner/repo",
		]);
	});

	test("異常系: ghコマンドが非ゼロ終了コードを返した場合GitHubErrorをスローする", async () => {
		await expect(
			fetchIssue(999, {
				exec: mockExec("", "Could not resolve to an Issue", 1),
			}),
		).rejects.toThrow(GitHubError);
	});

	test("異常系: エラーメッセージにIssue番号が含まれる", async () => {
		try {
			await fetchIssue(999, {
				exec: mockExec("", "Could not resolve to an Issue", 1),
			});
			expect.unreachable("Should have thrown");
		} catch (e) {
			expect(e).toBeInstanceOf(GitHubError);
			expect((e as GitHubError).message).toContain("999");
		}
	});

	test("異常系: 不正なJSONが返された場合GitHubErrorをスローする", async () => {
		await expect(
			fetchIssue(42, {
				exec: mockExec("not json", "", 0),
			}),
		).rejects.toThrow(GitHubError);
	});

	test("異常系: JSONスキーマに合わないデータの場合GitHubErrorをスローする", async () => {
		const invalidData = JSON.stringify({ title: 123, body: null });
		await expect(
			fetchIssue(42, {
				exec: mockExec(invalidData, "", 0),
			}),
		).rejects.toThrow(GitHubError);
	});

	test("異常系: execが例外をスローした場合GitHubErrorでラップする", async () => {
		const failingExec = mock(() => {
			throw new Error("spawn failed: gh not found");
		}) as ExecFn;

		await expect(fetchIssue(42, { exec: failingExec })).rejects.toThrow(
			GitHubError,
		);
	});
});

// ============================================================
// ヘルパー
// ============================================================

/** exec関数の型 */
type ExecFn = ReturnType<typeof mockExec>;

/** Bun.spawnを模倣するモック関数を生成 */
function mockExec(stdout: string, stderr: string, exitCode: number) {
	return mock(
		(_args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> =>
			Promise.resolve({ stdout, stderr, exitCode }),
	);
}
