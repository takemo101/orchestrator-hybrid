import { OrchestratorError } from "./errors.js";
import type { HatDefinition } from "./types.js";

/**
 * Hatシステムエラー
 */
export class HatError extends OrchestratorError {
	readonly hatId?: string;

	constructor(message: string, options?: ErrorOptions & { hatId?: string }) {
		super(message, options);
		this.name = "HatError";
		this.hatId = options?.hatId;
	}
}

/**
 * 組み込みHat定義（TDDサイクル用）
 */
export const BUILTIN_HATS: Record<string, HatDefinition> = {
	tester: {
		name: "🧪 Tester",
		triggers: ["task.start", "code.written"],
		publishes: ["tests.failing", "tests.passing"],
		instructions: `あなたはテストエンジニアです。

## 役割
- テストケースを作成する
- 既存のテストを実行する
- テスト結果を報告する

## ルール
- テスト駆動開発（TDD）の原則に従う
- まず失敗するテストを書く
- テストは具体的で明確であること

## 出力イベント
- テストが失敗した場合: EVENT: tests.failing
- テストが通過した場合: EVENT: tests.passing`,
	},
	implementer: {
		name: "🔨 Implementer",
		triggers: ["tests.failing"],
		publishes: ["code.written"],
		instructions: `あなたは実装エンジニアです。

## 役割
- 失敗しているテストを通過させる最小限の実装を行う
- コードの品質を保つ

## ルール
- テストを通過させることだけに集中する
- 過剰な実装は避ける
- YAGNIの原則に従う

## 出力イベント
- 実装が完了した場合: EVENT: code.written`,
	},
	refactorer: {
		name: "✨ Refactorer",
		triggers: ["tests.passing"],
		publishes: ["code.written", "LOOP_COMPLETE"],
		instructions: `あなたはリファクタリングエンジニアです。

## 役割
- コードの品質を向上させる
- 重複を排除する
- 可読性を改善する

## ルール
- テストが通過している状態を維持する
- 小さなステップでリファクタリングする
- リファクタリングが不要な場合は完了を宣言する

## 出力イベント
- リファクタリングを行った場合: EVENT: code.written
- タスク完了の場合: EVENT: LOOP_COMPLETE`,
	},
};

/**
 * Hatシステム
 *
 * AIエージェントに役割（Hat）を与え、イベントトリガーに基づいて
 * プロンプトの指示を切り替えるシステム。
 */
export class HatSystem {
	private readonly hats: Map<string, HatDefinition>;

	/**
	 * HatSystemを初期化する
	 *
	 * @param definitions - Hat定義のレコード（キー: Hat ID、値: Hat定義）
	 */
	constructor(definitions: Record<string, HatDefinition>) {
		this.hats = new Map();
		for (const [id, def] of Object.entries(definitions)) {
			this.hats.set(id, def);
		}
	}

	/**
	 * トリガーに一致するHatを検索する
	 *
	 * 複数のHatが同じトリガーを持つ場合、最初に見つかったものを返す。
	 *
	 * @param topic - イベントトピック
	 * @returns 一致するHat定義、見つからない場合はnull
	 */
	findHatByTrigger(topic: string): HatDefinition | null {
		if (!topic) {
			return null;
		}

		for (const hat of this.hats.values()) {
			if (hat.triggers.includes(topic)) {
				return hat;
			}
		}
		return null;
	}

	/**
	 * IDでHatを取得する
	 *
	 * @param id - Hat ID
	 * @returns Hat定義、存在しない場合はundefined
	 */
	getHat(id: string): HatDefinition | undefined {
		return this.hats.get(id);
	}

	/**
	 * 全てのHat定義を取得する
	 *
	 * @returns Hat定義の配列
	 */
	getAllHats(): HatDefinition[] {
		return Array.from(this.hats.values());
	}
}

/**
 * AIの出力からイベントを抽出する
 *
 * 以下のパターンを検出:
 * - `EVENT: topic_name` 形式のイベント
 * - `LOOP_COMPLETE` キーワード（EVENT:なしでも検出）
 *
 * 複数のイベントが含まれる場合は最後のものを返す。
 *
 * @param output - AIバックエンドの出力文字列
 * @returns 抽出されたイベントトピック、見つからない場合はnull
 */
export function extractEventFromOutput(output: string): string | null {
	if (!output) {
		return null;
	}

	// LOOP_COMPLETEを検出（EVENT:なしでも可）
	if (/loop_complete/i.test(output)) {
		// EVENT: LOOP_COMPLETEの形式があるかも確認
		const eventMatch = output.match(/event:\s*LOOP_COMPLETE/i);
		if (eventMatch) {
			return "LOOP_COMPLETE";
		}
		return "LOOP_COMPLETE";
	}

	// EVENT: pattern を検出（大文字小文字を区別しない）
	const matches = output.matchAll(/event:\s*(\S+)/gi);
	let lastEvent: string | null = null;

	for (const match of matches) {
		lastEvent = match[1].trim();
	}

	return lastEvent;
}
