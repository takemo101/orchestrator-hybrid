import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { EventBus, OrchEvent } from "./event.js";
import { EventEmitter } from "./event-emitter.js";

describe("EventEmitter", () => {
	let mockEventBus: EventBus;
	let mockEmit: ReturnType<typeof mock>;
	let emittedEvents: OrchEvent[];

	beforeEach(() => {
		emittedEvents = [];
		mockEmit = mock((type: string, hatId?: string, data?: Record<string, unknown>) => {
			emittedEvents.push({
				type,
				timestamp: new Date(),
				hatId,
				data,
			});
		});
		mockEventBus = {
			emit: mockEmit,
			on: mock(() => {}),
			off: mock(() => {}),
			getHistory: mock(() => []),
			getLastEvent: mock(() => undefined),
			findMatchingEvents: mock(() => []),
			clear: mock(() => {}),
		} as unknown as EventBus;
	});

	describe("emit", () => {
		it("should emit basic event with topic and message", async () => {
			const emitter = new EventEmitter(mockEventBus);

			const event = await emitter.emit("build.done", "tests: pass");

			expect(event.type).toBe("build.done");
			expect(event.data?.message).toBe("tests: pass");
			expect(event.timestamp).toBeDefined();
			expect(mockEmit).toHaveBeenCalled();
		});

		it("should parse JSON payload when json option is true", async () => {
			const emitter = new EventEmitter(mockEventBus);

			const event = await emitter.emit("review.done", '{"status": "approved", "score": 9}', {
				json: true,
			});

			expect(event.type).toBe("review.done");
			expect(event.data?.message).toEqual({ status: "approved", score: 9 });
		});

		it("should set target when target option is provided", async () => {
			const emitter = new EventEmitter(mockEventBus);

			const event = await emitter.emit("handoff", "Please review", {
				target: "reviewer",
			});

			expect(event.type).toBe("handoff");
			expect(event.data?.target).toBe("reviewer");
		});

		it("should combine json and target options", async () => {
			const emitter = new EventEmitter(mockEventBus);

			const event = await emitter.emit("handoff", '{"task": "review", "priority": "high"}', {
				json: true,
				target: "reviewer",
			});

			expect(event.type).toBe("handoff");
			expect(event.data?.message).toEqual({ task: "review", priority: "high" });
			expect(event.data?.target).toBe("reviewer");
		});
	});

	describe("emit validation", () => {
		it("should throw error when topic is empty", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await expect(emitter.emit("", "message")).rejects.toThrow(
				"イベントトピックが指定されていません",
			);
		});

		it("should throw error when topic is whitespace only", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await expect(emitter.emit("   ", "message")).rejects.toThrow(
				"イベントトピックが指定されていません",
			);
		});

		it("should throw error when message is empty", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await expect(emitter.emit("topic", "")).rejects.toThrow(
				"イベントメッセージが指定されていません",
			);
		});

		it("should throw error when message is whitespace only", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await expect(emitter.emit("topic", "   ")).rejects.toThrow(
				"イベントメッセージが指定されていません",
			);
		});

		it("should throw error when JSON parsing fails", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await expect(emitter.emit("topic", "invalid json", { json: true })).rejects.toThrow(
				"JSONペイロードの解析に失敗",
			);
		});

		it("should throw error when JSON is incomplete", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await expect(emitter.emit("topic", '{"status": ', { json: true })).rejects.toThrow(
				"JSONペイロードの解析に失敗",
			);
		});
	});

	describe("emit timestamp", () => {
		it("should have ISO 8601 timestamp", async () => {
			const emitter = new EventEmitter(mockEventBus);

			const event = await emitter.emit("topic", "message");

			expect(event.timestamp).toBeInstanceOf(Date);
		});
	});

	describe("emit eventBus integration", () => {
		it("should call eventBus.emit with correct arguments", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await emitter.emit("build.done", "tests: pass");

			expect(mockEmit).toHaveBeenCalledWith(
				"build.done",
				undefined,
				expect.objectContaining({
					message: "tests: pass",
				}),
			);
		});

		it("should pass target as hatId hint when specified", async () => {
			const emitter = new EventEmitter(mockEventBus);

			await emitter.emit("handoff", "Please review", { target: "reviewer" });

			expect(mockEmit).toHaveBeenCalledWith(
				"handoff",
				undefined,
				expect.objectContaining({
					message: "Please review",
					target: "reviewer",
				}),
			);
		});
	});
});
