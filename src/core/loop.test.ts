import { describe, expect, mock, test } from "bun:test";
import { EventBus } from "./event";
import {
	LoopEngine,
	LoopError,
	MaxIterationsReachedError,
} from "./loop";
import type { EventEntry } from "./event";

// ============================================================
// EventBus テスト
// ============================================================

describe("EventBus", () => {
	describe("emit / on", () => {
		test("発行したイベントが購読者に届く", () => {
			const bus = new EventBus();
			const received: EventEntry[] = [];

			bus.on("test.topic", (event) => received.push(event));
			bus.emit("test.topic", "TestSource");

			expect(received).toHaveLength(1);
			expect(received[0].topic).toBe("test.topic");
			expect(received[0].source).toBe("TestSource");
		});

		test("ペイロード付きのイベントを発行できる", () => {
			const bus = new EventBus();
			const received: EventEntry[] = [];

			bus.on("data.event", (event) => received.push(event));
			bus.emit("data.event", "Source", { key: "value", count: 42 });

			expect(received[0].payload).toEqual({ key: "value", count: 42 });
		});

		test("異なるトピックのイベントは届かない", () => {
			const bus = new EventBus();
			const received: EventEntry[] = [];

			bus.on("topic.a", (event) => received.push(event));
			bus.emit("topic.b", "Source");

			expect(received).toHaveLength(0);
		});

		test("ワイルドカード '*' で全トピックを購読できる", () => {
			const bus = new EventBus();
			const received: EventEntry[] = [];

			bus.on("*", (event) => received.push(event));
			bus.emit("topic.a", "Source");
			bus.emit("topic.b", "Source");

			expect(received).toHaveLength(2);
		});

		test("購読解除関数でハンドラを解除できる", () => {
			const bus = new EventBus();
			const received: EventEntry[] = [];

			const unsubscribe = bus.on("test", (event) => received.push(event));
			bus.emit("test", "Source");
			unsubscribe();
			bus.emit("test", "Source");

			expect(received).toHaveLength(1);
		});

		test("複数のハンドラに同時に通知される", () => {
			const bus = new EventBus();
			let count1 = 0;
			let count2 = 0;

			bus.on("multi", () => { count1++; });
			bus.on("multi", () => { count2++; });
			bus.emit("multi", "Source");

			expect(count1).toBe(1);
			expect(count2).toBe(1);
		});

		test("timestampはISO 8601形式", () => {
			const bus = new EventBus();
			const received: EventEntry[] = [];

			bus.on("time", (event) => received.push(event));
			bus.emit("time", "Source");

			const timestamp = received[0].timestamp;
			expect(() => new Date(timestamp)).not.toThrow();
			expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
		});
	});

	describe("getHistory", () => {
		test("全イベント履歴を取得する", () => {
			const bus = new EventBus();
			bus.emit("a", "Source");
			bus.emit("b", "Source");
			bus.emit("c", "Source");

			expect(bus.getHistory()).toHaveLength(3);
		});

		test("トピックでフィルタできる", () => {
			const bus = new EventBus();
			bus.emit("target", "Source");
			bus.emit("other", "Source");
			bus.emit("target", "Source");

			expect(bus.getHistory("target")).toHaveLength(2);
			expect(bus.getHistory("other")).toHaveLength(1);
		});

		test("履歴のコピーを返す（元の配列は変更されない）", () => {
			const bus = new EventBus();
			bus.emit("test", "Source");

			const history = bus.getHistory();
			history.length = 0;

			expect(bus.getHistory()).toHaveLength(1);
		});
	});

	describe("toJsonl", () => {
		test("JSONL形式に変換する", () => {
			const bus = new EventBus();
			bus.emit("a", "Source");
			bus.emit("b", "Source");

			const jsonl = bus.toJsonl();
			const lines = jsonl.split("\n");

			expect(lines).toHaveLength(2);
			expect(JSON.parse(lines[0]).topic).toBe("a");
			expect(JSON.parse(lines[1]).topic).toBe("b");
		});

		test("空の履歴では空文字列を返す", () => {
			const bus = new EventBus();
			expect(bus.toJsonl()).toBe("");
		});
	});

	describe("clear", () => {
		test("履歴をクリアする", () => {
			const bus = new EventBus();
			bus.emit("test", "Source");
			bus.emit("test", "Source");

			expect(bus.getHistory()).toHaveLength(2);

			bus.clear();

			expect(bus.getHistory()).toHaveLength(0);
		});

		test("ハンドラをクリアする", () => {
			const bus = new EventBus();
			let called = false;
			bus.on("test", () => { called = true; });

			bus.clear();
			bus.emit("test", "Source");

			expect(called).toBe(false);
		});
	});
});

// ============================================================
// LoopEngine テスト
// ============================================================

describe("LoopEngine", () => {
	describe("run", () => {
		test("LOOP_COMPLETE検出時にsuccessで終了する", async () => {
			const engine = new LoopEngine();
			const runner = mock((i: number) =>
				Promise.resolve(i === 2 ? "Done. LOOP_COMPLETE" : "Working..."),
			);

			const result = await engine.run(runner, { maxIterations: 10 });

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(2);
			expect(result.lastOutput).toContain("LOOP_COMPLETE");
		});

		test("大文字小文字を区別せずに完了キーワードを検出する", async () => {
			const engine = new LoopEngine();
			const runner = mock(() => Promise.resolve("loop_complete"));

			const result = await engine.run(runner, { maxIterations: 5 });

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(1);
		});

		test("最大反復回数超過でMaxIterationsReachedErrorをスローする", async () => {
			const engine = new LoopEngine();
			const runner = mock(() => Promise.resolve("Still working..."));

			await expect(
				engine.run(runner, { maxIterations: 3 }),
			).rejects.toThrow(MaxIterationsReachedError);
		});

		test("MaxIterationsReachedErrorに反復回数情報が含まれる", async () => {
			const engine = new LoopEngine();
			const runner = mock(() => Promise.resolve("Still working..."));

			try {
				await engine.run(runner, { maxIterations: 5 });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(MaxIterationsReachedError);
				const error = e as MaxIterationsReachedError;
				expect(error.iterations).toBe(5);
				expect(error.maxIterations).toBe(5);
			}
		});

		test("ランナーエラー時にLoopErrorをスローする", async () => {
			const engine = new LoopEngine();
			const runner = mock(() => Promise.reject(new Error("Backend crashed")));

			await expect(
				engine.run(runner, { maxIterations: 10 }),
			).rejects.toThrow(LoopError);
		});

		test("LoopErrorにcauseが設定される", async () => {
			const engine = new LoopEngine();
			const originalError = new Error("Backend crashed");
			const runner = mock(() => Promise.reject(originalError));

			try {
				await engine.run(runner, { maxIterations: 10 });
				expect.unreachable("Should have thrown");
			} catch (e) {
				expect(e).toBeInstanceOf(LoopError);
				expect((e as LoopError).cause).toBe(originalError);
			}
		});

		test("AbortSignalによる中断", async () => {
			const engine = new LoopEngine();
			const controller = new AbortController();
			controller.abort();

			const runner = mock(() => Promise.resolve("output"));

			const result = await engine.run(runner, {
				maxIterations: 10,
				signal: controller.signal,
			});

			expect(result.success).toBe(false);
			expect(result.iterations).toBe(0);
		});

		test("デフォルトの最大反復回数は100", async () => {
			const engine = new LoopEngine();
			let callCount = 0;
			const runner = mock((i: number) => {
				callCount++;
				if (i === 100) return Promise.resolve("LOOP_COMPLETE");
				return Promise.resolve("working");
			});

			const result = await engine.run(runner);

			expect(result.success).toBe(true);
			expect(callCount).toBe(100);
		});

		test("カスタム完了キーワードを使用できる", async () => {
			const engine = new LoopEngine();
			const runner = mock(() => Promise.resolve("TASK_DONE"));

			const result = await engine.run(runner, {
				maxIterations: 5,
				completionKeyword: "TASK_DONE",
			});

			expect(result.success).toBe(true);
		});

		test("1回目のイテレーションで完了できる", async () => {
			const engine = new LoopEngine();
			const runner = mock(() => Promise.resolve("LOOP_COMPLETE"));

			const result = await engine.run(runner, { maxIterations: 10 });

			expect(result.success).toBe(true);
			expect(result.iterations).toBe(1);
		});
	});

	describe("イベント発行", () => {
		test("ループ開始・完了イベントが発行される", async () => {
			const bus = new EventBus();
			const engine = new LoopEngine(bus);
			const events: string[] = [];

			bus.on("*", (e) => events.push(e.topic));

			const runner = mock(() => Promise.resolve("LOOP_COMPLETE"));
			await engine.run(runner, { maxIterations: 5 });

			expect(events).toContain("loop.start");
			expect(events).toContain("iteration.start");
			expect(events).toContain("iteration.end");
			expect(events).toContain("loop.complete");
		});

		test("エラー時にiteration.errorイベントが発行される", async () => {
			const bus = new EventBus();
			const engine = new LoopEngine(bus);
			const events: string[] = [];

			bus.on("*", (e) => events.push(e.topic));

			const runner = mock(() => Promise.reject(new Error("fail")));

			try {
				await engine.run(runner, { maxIterations: 5 });
			} catch {
				// expected
			}

			expect(events).toContain("iteration.error");
		});

		test("最大反復回数超過時にloop.maxIterationsイベントが発行される", async () => {
			const bus = new EventBus();
			const engine = new LoopEngine(bus);
			const events: string[] = [];

			bus.on("*", (e) => events.push(e.topic));

			const runner = mock(() => Promise.resolve("working"));

			try {
				await engine.run(runner, { maxIterations: 2 });
			} catch {
				// expected
			}

			expect(events).toContain("loop.maxIterations");
		});

		test("中断時にloop.abortedイベントが発行される", async () => {
			const bus = new EventBus();
			const engine = new LoopEngine(bus);
			const events: string[] = [];

			bus.on("*", (e) => events.push(e.topic));

			const controller = new AbortController();
			controller.abort();

			const runner = mock(() => Promise.resolve("output"));
			await engine.run(runner, { maxIterations: 5, signal: controller.signal });

			expect(events).toContain("loop.aborted");
		});
	});

	describe("getEventBus", () => {
		test("注入されたEventBusを返す", () => {
			const bus = new EventBus();
			const engine = new LoopEngine(bus);

			expect(engine.getEventBus()).toBe(bus);
		});

		test("EventBus未指定時は内部で生成されたものを返す", () => {
			const engine = new LoopEngine();

			expect(engine.getEventBus()).toBeInstanceOf(EventBus);
		});
	});
});
