import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { GlobMatcher } from "./glob-matcher.js";
import { logger } from "./logger.js";
import type { Hat } from "./types.js";

export interface OrchEvent {
	type: string;
	timestamp: Date;
	hatId?: string;
	data?: Record<string, unknown>;
}

const EVENT_LOG_PATH = ".agent/events.jsonl";

export class EventBus {
	private history: OrchEvent[] = [];
	private listeners: Map<string, ((event: OrchEvent) => void)[]> = new Map();

	constructor() {
		this.loadHistory();
	}

	emit(type: string, hatId?: string, data?: Record<string, unknown>): void {
		const event: OrchEvent = {
			type,
			timestamp: new Date(),
			hatId,
			data,
		};

		this.history.push(event);
		this.persistEvent(event);

		logger.debug(`Event emitted: ${type}${hatId ? ` (from ${hatId})` : ""}`);

		const callbacks = this.listeners.get(type) ?? [];
		for (const cb of callbacks) {
			cb(event);
		}

		const wildcardCallbacks = this.listeners.get("*") ?? [];
		for (const cb of wildcardCallbacks) {
			cb(event);
		}
	}

	on(type: string, callback: (event: OrchEvent) => void): void {
		const existing = this.listeners.get(type) ?? [];
		existing.push(callback);
		this.listeners.set(type, existing);
	}

	off(type: string, callback: (event: OrchEvent) => void): void {
		const existing = this.listeners.get(type) ?? [];
		const index = existing.indexOf(callback);
		if (index !== -1) {
			existing.splice(index, 1);
			this.listeners.set(type, existing);
		}
	}

	getHistory(): OrchEvent[] {
		return [...this.history];
	}

	getLastEvent(): OrchEvent | undefined {
		return this.history[this.history.length - 1];
	}

	findMatchingEvents(pattern: string): OrchEvent[] {
		if (pattern === "*") {
			return this.history;
		}

		if (pattern.endsWith(".*")) {
			const prefix = pattern.slice(0, -2);
			return this.history.filter((e) => e.type.startsWith(`${prefix}.`));
		}

		return this.history.filter((e) => e.type === pattern);
	}

	private loadHistory(): void {
		if (!existsSync(EVENT_LOG_PATH)) {
			return;
		}

		try {
			const content = readFileSync(EVENT_LOG_PATH, "utf-8");
			const lines = content.split("\n").filter(Boolean);

			for (const line of lines) {
				const event = JSON.parse(line) as OrchEvent;
				event.timestamp = new Date(event.timestamp);
				this.history.push(event);
			}
		} catch {
			logger.warn("Failed to load event history");
		}
	}

	private persistEvent(event: OrchEvent): void {
		mkdirSync(dirname(EVENT_LOG_PATH), { recursive: true });
		appendFileSync(EVENT_LOG_PATH, `${JSON.stringify(event)}\n`);
	}

	clear(): void {
		this.history = [];
		this.listeners.clear();
	}
}

export const globalEventBus = new EventBus();

/**
 * イベントトピックにマッチするHatを検索
 *
 * GlobMatcherを使用して、優先度ルールに従ってマッチングを行います:
 * 1. 具体的パターン（完全一致）が最優先
 * 2. ワイルドカードパターン（`build.*`, `*.done`）が次
 * 3. グローバルワイルドカード（`*`）がフォールバック
 *
 * @param eventType - イベントトピック
 * @param hats - Hat定義
 * @returns マッチしたHat名の配列
 * @throws GlobPatternError - 複数の具体的パターンがマッチした場合（曖昧なルーティング）
 */
export function findMatchingHatsForEvent(
	eventType: string,
	hats: Record<string, Hat>,
): string[] {
	const matcher = new GlobMatcher(hats);
	return matcher.match(eventType);
}
