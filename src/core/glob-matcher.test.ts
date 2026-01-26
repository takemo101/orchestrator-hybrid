import { describe, expect, it } from "bun:test";
import { GlobMatcher } from "./glob-matcher.js";
import type { Hat } from "./types.js";

describe("GlobMatcher", () => {
	const createHat = (triggers: string[]): Hat => ({
		triggers,
		publishes: [],
	});

	describe("isMatch", () => {
		const matcher = new GlobMatcher({});

		it("完全一致パターンにマッチする", () => {
			expect(matcher.isMatch("task.start", "task.start")).toBe(true);
		});

		it("完全一致しない場合はfalse", () => {
			expect(matcher.isMatch("task.start", "task.end")).toBe(false);
		});

		it("プレフィックスワイルドカード (build.*) にマッチする", () => {
			expect(matcher.isMatch("build.*", "build.done")).toBe(true);
			expect(matcher.isMatch("build.*", "build.start")).toBe(true);
		});

		it("プレフィックスワイルドカードが異なるプレフィックスにはマッチしない", () => {
			expect(matcher.isMatch("build.*", "task.done")).toBe(false);
		});

		it("サフィックスワイルドカード (*.done) にマッチする", () => {
			expect(matcher.isMatch("*.done", "build.done")).toBe(true);
			expect(matcher.isMatch("*.done", "task.done")).toBe(true);
		});

		it("サフィックスワイルドカードが異なるサフィックスにはマッチしない", () => {
			expect(matcher.isMatch("*.done", "build.start")).toBe(false);
		});

		it("グローバルワイルドカード (*) はすべてにマッチする", () => {
			expect(matcher.isMatch("*", "anything")).toBe(true);
			expect(matcher.isMatch("*", "task.start")).toBe(true);
			expect(matcher.isMatch("*", "")).toBe(true);
		});

		it("部分一致はマッチしない (含んでいるだけではダメ)", () => {
			expect(matcher.isMatch("task", "task.start")).toBe(false);
			expect(matcher.isMatch("start", "task.start")).toBe(false);
		});
	});

	describe("match", () => {
		it("具体的パターンで単一のHatにマッチする", () => {
			const hats: Record<string, Hat> = {
				tester: createHat(["task.start"]),
				builder: createHat(["tests.failing"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("task.start");
			expect(result).toEqual(["tester"]);
		});

		it("プレフィックスワイルドカードでマッチする", () => {
			const hats: Record<string, Hat> = {
				builder: createHat(["build.*"]),
				reviewer: createHat(["review.*"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("build.done");
			expect(result).toEqual(["builder"]);
		});

		it("サフィックスワイルドカードでマッチする", () => {
			const hats: Record<string, Hat> = {
				handler: createHat(["*.done"]),
				starter: createHat(["*.start"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("task.done");
			expect(result).toEqual(["handler"]);
		});

		it("グローバルワイルドカード (*) がフォールバックとして機能する", () => {
			const hats: Record<string, Hat> = {
				fallback: createHat(["*"]),
				specific: createHat(["task.start"]),
			};
			const matcher = new GlobMatcher(hats);

			// specific は task.start にのみマッチ
			// fallback は * でキャッチオール
			const result = matcher.match("unknown.event");
			expect(result).toEqual(["fallback"]);
		});

		it("具体的パターンがワイルドカードより優先される", () => {
			const hats: Record<string, Hat> = {
				wildcard: createHat(["build.*"]),
				specific: createHat(["build.done"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("build.done");
			// 具体的パターン "build.done" が優先される
			expect(result).toEqual(["specific"]);
		});

		it("具体的パターンがグローバルワイルドカードより優先される", () => {
			const hats: Record<string, Hat> = {
				fallback: createHat(["*"]),
				specific: createHat(["task.start"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("task.start");
			// 具体的パターンが優先される
			expect(result).toEqual(["specific"]);
		});

		it("複数のワイルドカードパターンがマッチした場合はすべて返す", () => {
			const hats: Record<string, Hat> = {
				prefixHandler: createHat(["build.*"]),
				suffixHandler: createHat(["*.done"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("build.done");
			// 両方のワイルドカードにマッチ
			expect(result).toContain("prefixHandler");
			expect(result).toContain("suffixHandler");
			expect(result.length).toBe(2);
		});

		it("マッチするHatがない場合は空配列を返す", () => {
			const hats: Record<string, Hat> = {
				tester: createHat(["task.start"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("unknown.event");
			expect(result).toEqual([]);
		});

		it("複数の具体的パターンが同じトピックにマッチした場合はエラーをスローする", () => {
			const hats: Record<string, Hat> = {
				hat1: createHat(["task.start"]),
				hat2: createHat(["task.start"]),
			};
			const matcher = new GlobMatcher(hats);

			expect(() => matcher.match("task.start")).toThrow(
				/曖昧なルーティング|multiple.*match/i,
			);
		});

		it("Hatが複数のトリガーを持つ場合でも正しくマッチする", () => {
			const hats: Record<string, Hat> = {
				multiTrigger: createHat(["task.start", "task.end", "code.written"]),
			};
			const matcher = new GlobMatcher(hats);

			expect(matcher.match("task.start")).toEqual(["multiTrigger"]);
			expect(matcher.match("task.end")).toEqual(["multiTrigger"]);
			expect(matcher.match("code.written")).toEqual(["multiTrigger"]);
		});
	});

	describe("findExactMatches (private method via match)", () => {
		it("完全一致するHatのみを返す", () => {
			const hats: Record<string, Hat> = {
				exact: createHat(["task.start"]),
				wildcard: createHat(["task.*"]),
				global: createHat(["*"]),
			};
			const matcher = new GlobMatcher(hats);

			// 具体的パターンが優先されるので exact のみ
			const result = matcher.match("task.start");
			expect(result).toEqual(["exact"]);
		});
	});

	describe("findWildcardMatches (private method via match)", () => {
		it("ワイルドカードパターンにマッチするHatを返す（具体的パターンがない場合）", () => {
			const hats: Record<string, Hat> = {
				prefix: createHat(["task.*"]),
				suffix: createHat(["*.end"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("task.end");
			expect(result).toContain("prefix");
			expect(result).toContain("suffix");
		});
	});

	describe("findGlobalWildcard (private method via match)", () => {
		it("グローバルワイルドカードを持つHatを返す（他にマッチがない場合）", () => {
			const hats: Record<string, Hat> = {
				global: createHat(["*"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("any.event");
			expect(result).toEqual(["global"]);
		});

		it("他のパターンにマッチがある場合はグローバルワイルドカードを返さない", () => {
			const hats: Record<string, Hat> = {
				global: createHat(["*"]),
				specific: createHat(["task.*"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("task.start");
			// task.* にマッチするので global は返されない
			expect(result).toEqual(["specific"]);
		});
	});

	describe("エッジケース", () => {
		it("空のHats定義でも動作する", () => {
			const matcher = new GlobMatcher({});
			const result = matcher.match("task.start");
			expect(result).toEqual([]);
		});

		it("空文字列のトピックでも動作する", () => {
			const hats: Record<string, Hat> = {
				global: createHat(["*"]),
			};
			const matcher = new GlobMatcher(hats);

			const result = matcher.match("");
			expect(result).toEqual(["global"]);
		});

		it("特殊文字を含むトピックでも正しくマッチする", () => {
			const hats: Record<string, Hat> = {
				handler: createHat(["error.500"]),
			};
			const matcher = new GlobMatcher(hats);

			expect(matcher.match("error.500")).toEqual(["handler"]);
		});

		it("複数のワイルドカード (e.g., *.*.done) はサポートしない", () => {
			const hats: Record<string, Hat> = {
				handler: createHat(["*.*.done"]),
			};
			const matcher = new GlobMatcher(hats);

			// 複数ワイルドカードはサポート外なので、単純な文字列として扱われる
			expect(matcher.match("task.sub.done")).toEqual([]);
		});
	});
});
