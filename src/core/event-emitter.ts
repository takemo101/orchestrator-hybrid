/**
 * EventEmitter - CLI経由でイベントを発行するクラス
 *
 * `orch emit` コマンドで使用され、外部システムやスクリプトから
 * オーケストレーターのイベントバスを操作可能にします。
 *
 * @module
 */

import type { EventBus, OrchEvent } from "./event.js";
import { logger } from "./logger.js";

/**
 * イベント発行オプション
 */
export interface EmitOptions {
	/**
	 * メッセージをJSONペイロードとして解析するか
	 * @default false
	 */
	json?: boolean;

	/**
	 * ターゲットHat（ハンドオフ用）
	 * 指定した場合、特定のHatのみがトリガーされる
	 */
	target?: string;
}

/**
 * CLI経由でイベントを発行するクラス
 *
 * @example
 * ```typescript
 * const emitter = new EventEmitter(eventBus);
 *
 * // 基本的なイベント発行
 * await emitter.emit("build.done", "tests: pass");
 *
 * // JSONペイロード
 * await emitter.emit("review.done", '{"status": "approved"}', { json: true });
 *
 * // ハンドオフ
 * await emitter.emit("handoff", "Please review", { target: "reviewer" });
 * ```
 */
export class EventEmitter {
	private readonly eventBus: EventBus;

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/**
	 * イベントを発行
	 *
	 * @param topic - イベントトピック
	 * @param message - メッセージまたはJSONペイロード
	 * @param options - オプション
	 * @returns 発行されたイベント
	 * @throws Error - トピックまたはメッセージが空、JSON解析失敗時
	 */
	async emit(topic: string, message: string, options?: EmitOptions): Promise<OrchEvent> {
		// バリデーション
		if (!topic || topic.trim() === "") {
			throw new Error("イベントトピックが指定されていません");
		}

		if (!message || message.trim() === "") {
			throw new Error("イベントメッセージが指定されていません");
		}

		// メッセージの解析
		let parsedMessage: string | Record<string, unknown> = message;
		if (options?.json) {
			try {
				parsedMessage = JSON.parse(message);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				throw new Error(`JSONペイロードの解析に失敗: ${errorMessage}`);
			}
		}

		// イベントデータ作成
		const data: Record<string, unknown> = {
			message: parsedMessage,
		};

		if (options?.target) {
			data.target = options.target;
		}

		// イベント発行
		logger.info(`イベント発行: ${topic}${options?.target ? ` → ${options.target}` : ""}`);
		this.eventBus.emit(topic, undefined, data);

		// 発行されたイベントを返す
		const event: OrchEvent = {
			type: topic,
			timestamp: new Date(),
			data,
		};

		return event;
	}
}
