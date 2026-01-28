/**
 * イベントエントリ
 *
 * Hat間通信やループ状態遷移で発行されるイベントの構造体。
 */
export interface EventEntry {
	/** イベントトピック（例: "tests.failing", "LOOP_COMPLETE"） */
	topic: string;
	/** イベント発行元（Hat名等） */
	source: string;
	/** イベントペイロード（任意のデータ） */
	payload?: Record<string, unknown>;
	/** 発行日時（ISO 8601形式） */
	timestamp: string;
}

/**
 * イベントハンドラ型
 */
export type EventHandler = (event: EventEntry) => void;

/**
 * イベントバス
 *
 * Hat間通信やループ状態遷移のためのPub/Subイベントバス。
 * イベントはメモリ上に保持され、events.jsonl形式で永続化可能。
 */
export class EventBus {
	private readonly handlers = new Map<string, Set<EventHandler>>();
	private readonly history: EventEntry[] = [];

	/**
	 * イベントを発行する
	 *
	 * @param topic - イベントトピック
	 * @param source - イベント発行元
	 * @param payload - イベントペイロード（省略可）
	 */
	emit(topic: string, source: string, payload?: Record<string, unknown>): void {
		const event: EventEntry = {
			topic,
			source,
			payload,
			timestamp: new Date().toISOString(),
		};

		this.history.push(event);

		const topicHandlers = this.handlers.get(topic);
		if (topicHandlers) {
			for (const handler of topicHandlers) {
				handler(event);
			}
		}

		// ワイルドカード "*" ハンドラにも通知
		const wildcardHandlers = this.handlers.get("*");
		if (wildcardHandlers) {
			for (const handler of wildcardHandlers) {
				handler(event);
			}
		}
	}

	/**
	 * イベントを購読する
	 *
	 * @param topic - 購読するトピック（"*" で全トピック購読）
	 * @param handler - イベントハンドラ
	 * @returns 購読解除関数
	 */
	on(topic: string, handler: EventHandler): () => void {
		if (!this.handlers.has(topic)) {
			this.handlers.set(topic, new Set());
		}
		const topicHandlers = this.handlers.get(topic) as Set<EventHandler>;
		topicHandlers.add(handler);

		return () => {
			topicHandlers.delete(handler);
		};
	}

	/**
	 * イベント履歴を取得する
	 *
	 * @param topic - フィルタするトピック（省略時は全件）
	 * @returns イベントエントリの配列（コピー）
	 */
	getHistory(topic?: string): EventEntry[] {
		if (topic) {
			return this.history.filter((e) => e.topic === topic);
		}
		return [...this.history];
	}

	/**
	 * イベント履歴をJSONL形式の文字列に変換する
	 *
	 * @returns JSONL形式の文字列
	 */
	toJsonl(): string {
		return this.history.map((e) => JSON.stringify(e)).join("\n");
	}

	/**
	 * イベント履歴をクリアする
	 */
	clear(): void {
		this.history.length = 0;
		this.handlers.clear();
	}
}
