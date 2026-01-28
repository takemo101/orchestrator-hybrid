import { describe, expect, mock, test } from "bun:test";
import {
	CircularDependencyError,
	DependencyResolver,
	parseDependencies,
} from "./dependency";
import { GitHubError } from "./errors";

/**
 * DependencyResolver テスト
 *
 * Issue間の依存関係を解析し、トポロジカルソートで実行順序を決定する。
 */

describe("parseDependencies", () => {
	test("'Blocked by #42' から依存IDを抽出する", () => {
		const body = "This issue is Blocked by #42";
		expect(parseDependencies(body)).toEqual([42]);
	});

	test("'Depends on #43, #44' から複数の依存IDを抽出する", () => {
		const body = "Depends on #43 and #44";
		expect(parseDependencies(body)).toEqual([43, 44]);
	});

	test("'前提Issue: #45' から依存IDを抽出する（日本語対応）", () => {
		const body = "前提Issue: #45";
		expect(parseDependencies(body)).toEqual([45]);
	});

	test("'Needs #10' から依存IDを抽出する", () => {
		const body = "Needs #10 before starting";
		expect(parseDependencies(body)).toEqual([10]);
	});

	test("依存関係の記述がない場合は空配列を返す", () => {
		const body = "## Task\nImplement feature X";
		expect(parseDependencies(body)).toEqual([]);
	});

	test("重複するIssue番号は除去する", () => {
		const body = "Blocked by #42\nDepends on #42 and #43";
		expect(parseDependencies(body)).toEqual([42, 43]);
	});

	test("通常の#番号（単独の#123など）は抽出しない", () => {
		const body = "See #123 for details";
		expect(parseDependencies(body)).toEqual([]);
	});
});

describe("DependencyResolver", () => {
	describe("resolveOrder", () => {
		test("依存がない単一Issueは自身のみを返す", async () => {
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					42: { number: 42, title: "Test", body: "No deps", labels: [] },
				}),
			});

			const order = await resolver.resolveOrder(42);
			expect(order).toEqual([42]);
		});

		test("単一の依存関係を正しく解決する (A -> B)", async () => {
			// Issue #10 は #5 に依存 → 実行順序: [5, 10]
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #5", labels: [] },
					5: { number: 5, title: "B", body: "No deps", labels: [] },
				}),
			});

			const order = await resolver.resolveOrder(10);
			expect(order).toEqual([5, 10]);
		});

		test("複数の依存関係を正しく解決する (A -> B, A -> C)", async () => {
			// Issue #10 は #5 と #6 に依存 → 実行順序: [5, 6, 10] or [6, 5, 10]
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #5 and #6", labels: [] },
					5: { number: 5, title: "B", body: "No deps", labels: [] },
					6: { number: 6, title: "C", body: "No deps", labels: [] },
				}),
			});

			const order = await resolver.resolveOrder(10);
			// 5と6がどちらが先でも良いが、10は最後
			expect(order.length).toBe(3);
			expect(order[order.length - 1]).toBe(10); // 10 is always last
			expect(order).toContain(5);
			expect(order).toContain(6);
		});

		test("チェーン依存を正しく解決する (A -> B -> C)", async () => {
			// Issue #10 -> #5 -> #2 → 実行順序: [2, 5, 10]
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Blocked by #5", labels: [] },
					5: { number: 5, title: "B", body: "Blocked by #2", labels: [] },
					2: { number: 2, title: "C", body: "No deps", labels: [] },
				}),
			});

			const order = await resolver.resolveOrder(10);
			expect(order).toEqual([2, 5, 10]);
		});

		test("完了済みIssue（closed状態）はスキップする", async () => {
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #5", labels: [] },
					5: { number: 5, title: "B", body: "No deps", labels: ["orch:completed"] },
				}),
			});

			const order = await resolver.resolveOrder(10);
			// #5 は完了済みなのでスキップ
			expect(order).toEqual([10]);
		});

		test("循環依存を検出してエラーをスローする (A -> B -> A)", async () => {
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #5", labels: [] },
					5: { number: 5, title: "B", body: "Depends on #10", labels: [] },
				}),
			});

			await expect(resolver.resolveOrder(10)).rejects.toThrow(CircularDependencyError);
		});

		test("循環依存エラーにはサイクルパスが含まれる", async () => {
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #5", labels: [] },
					5: { number: 5, title: "B", body: "Depends on #10", labels: [] },
				}),
			});

			try {
				await resolver.resolveOrder(10);
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(CircularDependencyError);
				expect((e as CircularDependencyError).cycle).toContain(10);
				expect((e as CircularDependencyError).cycle).toContain(5);
			}
		});

		test("存在しない依存Issueは警告してスキップする", async () => {
			const warnLogs: string[] = [];
			const originalWarn = console.warn;
			console.warn = (msg: string) => warnLogs.push(msg);

			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #999", labels: [] },
				}),
			});

			const order = await resolver.resolveOrder(10);
			expect(order).toEqual([10]);
			expect(warnLogs.some((log) => log.includes("999"))).toBe(true);

			console.warn = originalWarn;
		});
	});

	describe("buildGraph", () => {
		test("依存グラフを正しく構築する", async () => {
			const resolver = new DependencyResolver({
				fetchIssue: mockFetchIssue({
					10: { number: 10, title: "A", body: "Depends on #5", labels: [] },
					5: { number: 5, title: "B", body: "No deps", labels: [] },
				}),
			});

			const graph = await resolver.buildGraph(10);
			expect(graph.get(10)?.dependencies).toEqual([5]);
			expect(graph.get(5)?.dependencies).toEqual([]);
		});
	});
});

// ============================================================
// ヘルパー
// ============================================================

interface MockIssue {
	number: number;
	title: string;
	body: string;
	labels: string[];
}

function mockFetchIssue(issues: Record<number, MockIssue>) {
	return mock((issueNumber: number) => {
		const issue = issues[issueNumber];
		if (!issue) {
			return Promise.reject(new GitHubError(`Issue #${issueNumber} not found`));
		}
		return Promise.resolve(issue);
	});
}
