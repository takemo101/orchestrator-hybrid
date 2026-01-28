import { describe, expect, mock, test } from "bun:test";
import { PRCreateError, PRCreator } from "./pr";

/**
 * PRCreator テスト
 *
 * 変更のコミット → プッシュ → gh pr create の統合テスト。
 * ExecFnをモックして外部コマンド依存を排除する。
 */

/** exec関数のモック型 */
type MockExec = ReturnType<typeof createMockExec>;

/** 呼び出し順を記録するexecモックを作成 */
function createMockExec(responses: Array<{ stdout: string; stderr: string; exitCode: number }>) {
	let callIndex = 0;
	return mock((_args: string[]) => {
		const response = responses[callIndex];
		if (!response) {
			return Promise.resolve({ stdout: "", stderr: "unexpected call", exitCode: 1 });
		}
		callIndex++;
		return Promise.resolve(response);
	});
}

/** 成功レスポンス */
const ok = (stdout = "") => ({ stdout, stderr: "", exitCode: 0 });

/** 失敗レスポンス */
const fail = (stderr = "error") => ({ stdout: "", stderr, exitCode: 1 });

describe("PRCreator", () => {
	describe("正常系", () => {
		test("変更がある場合、コミット・プッシュ・PR作成が順番に実行される", async () => {
			const execFn = createMockExec([
				ok("M src/file.ts\n"), // git status --porcelain
				ok(), // git add -A
				ok(), // git commit
				ok(), // git push
				ok("https://github.com/owner/repo/pull/42\n"), // gh pr create
			]);

			const creator = new PRCreator({ exec: execFn });
			const result = await creator.create(42, "feature/issue-42", "Add auth");

			expect(result.url).toBe("https://github.com/owner/repo/pull/42");
			expect(execFn).toHaveBeenCalledTimes(5);
		});

		test("git statusコマンドに正しい引数が渡される", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(1, "feature/issue-1", "Title");

			expect(execFn.mock.calls[0][0]).toEqual(["git", "status", "--porcelain"]);
		});

		test("コミットメッセージにIssueタイトルと番号が含まれる", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(99, "feature/issue-99", "Fix bug");

			// git commit -m の引数を検証
			const commitArgs = execFn.mock.calls[2][0] as string[];
			expect(commitArgs[0]).toBe("git");
			expect(commitArgs[1]).toBe("commit");
			expect(commitArgs[3]).toContain("Fix bug");
			expect(commitArgs[3]).toContain("#99");
		});

		test("gh pr createに正しい引数が渡される（非ドラフト）", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(42, "feature/issue-42", "Add auth");

			const prArgs = execFn.mock.calls[4][0] as string[];
			expect(prArgs).toContain("gh");
			expect(prArgs).toContain("pr");
			expect(prArgs).toContain("create");
			expect(prArgs).toContain("--head");
			expect(prArgs).toContain("feature/issue-42");
			expect(prArgs).toContain("--base");
			expect(prArgs).toContain("main");
			expect(prArgs).not.toContain("--draft");
		});

		test("ドラフトPR作成時に--draftフラグが付与される", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(42, "feature/issue-42", "Add auth", { draft: true });

			const prArgs = execFn.mock.calls[4][0] as string[];
			expect(prArgs).toContain("--draft");
		});

		test("カスタムベースブランチを指定できる", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(42, "feature/issue-42", "Add auth", { baseBranch: "develop" });

			const prArgs = execFn.mock.calls[4][0] as string[];
			const baseIdx = prArgs.indexOf("--base");
			expect(prArgs[baseIdx + 1]).toBe("develop");
		});

		test("カスタムタイトルとボディを指定できる", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(42, "feature/issue-42", "Add auth", {
				title: "Custom Title",
				body: "Custom Body",
			});

			const prArgs = execFn.mock.calls[4][0] as string[];
			const titleIdx = prArgs.indexOf("--title");
			expect(prArgs[titleIdx + 1]).toBe("Custom Title");
			const bodyIdx = prArgs.indexOf("--body");
			expect(prArgs[bodyIdx + 1]).toBe("Custom Body");
		});

		test("自動生成タイトルの形式が正しい", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(42, "feature/issue-42", "Add user auth");

			const prArgs = execFn.mock.calls[4][0] as string[];
			const titleIdx = prArgs.indexOf("--title");
			expect(prArgs[titleIdx + 1]).toBe("feat: Add user auth (resolve #42)");
		});

		test("自動生成ボディにCloses句が含まれる", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok("https://github.com/owner/repo/pull/1\n"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await creator.create(42, "feature/issue-42", "Title");

			const prArgs = execFn.mock.calls[4][0] as string[];
			const bodyIdx = prArgs.indexOf("--body");
			expect(prArgs[bodyIdx + 1]).toContain("Closes #42");
		});
	});

	describe("異常系", () => {
		test("変更がない場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([
				ok(""), // git status returns empty
			]);

			const creator = new PRCreator({ exec: execFn });
			try {
				await creator.create(42, "feature/issue-42", "Title");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(PRCreateError);
				expect((e as PRCreateError).message).toBe("No changes to create PR");
			}
		});

		test("git statusが失敗した場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([fail("fatal: not a git repository")]);

			const creator = new PRCreator({ exec: execFn });
			await expect(creator.create(42, "feature/issue-42", "Title")).rejects.toThrow(PRCreateError);
		});

		test("git addが失敗した場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				fail("error: could not stage"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await expect(creator.create(42, "feature/issue-42", "Title")).rejects.toThrow(PRCreateError);
		});

		test("git commitが失敗した場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				fail("error: could not commit"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await expect(creator.create(42, "feature/issue-42", "Title")).rejects.toThrow(PRCreateError);
		});

		test("git pushが失敗した場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				fail("error: failed to push"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await expect(creator.create(42, "feature/issue-42", "Title")).rejects.toThrow(PRCreateError);
		});

		test("gh pr createが失敗した場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				fail("error: authentication required"),
			]);

			const creator = new PRCreator({ exec: execFn });
			await expect(creator.create(42, "feature/issue-42", "Title")).rejects.toThrow(PRCreateError);
		});

		test("gh pr createが空のURLを返した場合PRCreateErrorをスローする", async () => {
			const execFn = createMockExec([
				ok("M file.ts\n"),
				ok(),
				ok(),
				ok(),
				ok(""), // empty URL
			]);

			const creator = new PRCreator({ exec: execFn });
			await expect(creator.create(42, "feature/issue-42", "Title")).rejects.toThrow(
				"gh pr create returned empty URL",
			);
		});

		test("エラーメッセージにstderrの内容が含まれる", async () => {
			const execFn = createMockExec([fail("fatal: not a git repository")]);

			const creator = new PRCreator({ exec: execFn });
			try {
				await creator.create(42, "feature/issue-42", "Title");
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(PRCreateError);
				expect((e as PRCreateError).message).toContain("not a git repository");
			}
		});
	});
});
