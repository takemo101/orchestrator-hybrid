import { GlobPatternError } from "./errors.js";
import { logger } from "./logger.js";
import type { Hat } from "./types.js";

/**
 * Globパターンマッチャー
 *
 * イベントトピックのワイルドカード（`*`）マッチングを実装し、
 * 柔軟なイベントルーティングを実現します。
 *
 * @example
 * ```typescript
 * const matcher = new GlobMatcher(hats);
 * const matchedHats = matcher.match("build.done");
 * ```
 */
export class GlobMatcher {
	private readonly hats: Record<string, Hat>;

	/**
	 * コンストラクタ
	 * @param hats - Hat定義
	 */
	constructor(hats: Record<string, Hat>) {
		this.hats = hats;
	}

	/**
	 * イベントトピックにマッチするHatを検索
	 *
	 * 優先度ルール:
	 * 1. 具体的パターン（完全一致）が最優先
	 * 2. ワイルドカードパターン（`build.*`, `*.done`）が次
	 * 3. グローバルワイルドカード（`*`）がフォールバック
	 *
	 * @param topic - イベントトピック
	 * @returns マッチしたHat名の配列
	 * @throws GlobPatternError - 複数の具体的パターンがマッチした場合（曖昧なルーティング）
	 */
	match(topic: string): string[] {
		// 1. 具体的パターン（完全一致）を検索
		const exactMatches = this.findExactMatches(topic);
		if (exactMatches.length > 0) {
			if (exactMatches.length > 1) {
				throw new GlobPatternError(
					`曖昧なルーティング: イベント '${topic}' が複数のHatにマッチ: ${exactMatches.join(", ")}`,
					{ topic, matchedHats: exactMatches },
				);
			}
			return exactMatches;
		}

		// 2. ワイルドカードパターンを検索
		const wildcardMatches = this.findWildcardMatches(topic);
		if (wildcardMatches.length > 0) {
			return wildcardMatches;
		}

		// 3. グローバルワイルドカード（*）を検索
		const globalWildcardMatches = this.findGlobalWildcard();
		if (globalWildcardMatches.length > 0) {
			return globalWildcardMatches;
		}

		// マッチなし
		logger.debug(`イベント '${topic}' にマッチするHatがありません`);
		return [];
	}

	/**
	 * 具体的パターンでマッチするHatを検索
	 *
	 * @param topic - イベントトピック
	 * @returns マッチしたHat名の配列
	 */
	private findExactMatches(topic: string): string[] {
		const matches: string[] = [];

		for (const [hatId, hat] of Object.entries(this.hats)) {
			for (const trigger of hat.triggers) {
				// ワイルドカードを含まない完全一致のみ
				if (!trigger.includes("*") && trigger === topic) {
					matches.push(hatId);
					break; // 同一Hatからは1回のみカウント
				}
			}
		}

		return matches;
	}

	/**
	 * ワイルドカードパターンでマッチするHatを検索
	 * （グローバルワイルドカード `*` を除く）
	 *
	 * @param topic - イベントトピック
	 * @returns マッチしたHat名の配列
	 */
	private findWildcardMatches(topic: string): string[] {
		const matches: string[] = [];

		for (const [hatId, hat] of Object.entries(this.hats)) {
			for (const trigger of hat.triggers) {
				// グローバルワイルドカード以外のワイルドカードパターンのみ
				if (trigger !== "*" && trigger.includes("*")) {
					if (this.isMatch(trigger, topic)) {
						matches.push(hatId);
						break; // 同一Hatからは1回のみカウント
					}
				}
			}
		}

		return matches;
	}

	/**
	 * グローバルワイルドカード（*）を持つHatを検索
	 *
	 * @returns マッチしたHat名の配列
	 */
	private findGlobalWildcard(): string[] {
		const matches: string[] = [];

		for (const [hatId, hat] of Object.entries(this.hats)) {
			if (hat.triggers.includes("*")) {
				matches.push(hatId);
			}
		}

		return matches;
	}

	/**
	 * パターンがトピックにマッチするか判定
	 *
	 * サポートするパターン:
	 * - 完全一致: `task.start`
	 * - プレフィックスワイルドカード: `build.*`
	 * - サフィックスワイルドカード: `*.done`
	 * - グローバルワイルドカード: `*`
	 *
	 * 注意: 複数ワイルドカード（`*.*.done`）はサポート外
	 *
	 * @param pattern - トリガーパターン
	 * @param topic - イベントトピック
	 * @returns マッチする場合はtrue
	 */
	isMatch(pattern: string, topic: string): boolean {
		// グローバルワイルドカード
		if (pattern === "*") {
			return true;
		}

		// 完全一致
		if (!pattern.includes("*")) {
			return pattern === topic;
		}

		// プレフィックスワイルドカード（例: build.*）
		if (pattern.endsWith(".*")) {
			const prefix = pattern.slice(0, -2);
			return topic.startsWith(`${prefix}.`);
		}

		// サフィックスワイルドカード（例: *.done）
		if (pattern.startsWith("*.")) {
			const suffix = pattern.slice(2);
			return topic.endsWith(`.${suffix}`);
		}

		// その他のワイルドカードパターンはサポート外
		// 単純な文字列比較として扱う
		return pattern === topic;
	}
}
