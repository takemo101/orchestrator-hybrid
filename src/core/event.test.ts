import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { EventBus } from "./event.js";

describe("EventBus", () => {
	const testDir = ".test-events";

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
		if (existsSync(".agent")) {
			rmSync(".agent", { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
		if (existsSync(".agent")) {
			rmSync(".agent", { recursive: true });
		}
	});

	describe("emit", () => {
		it("should add event to history", () => {
			const bus = new EventBus();
			bus.emit("test.event");

			const history = bus.getHistory();
			expect(history).toHaveLength(1);
			expect(history[0].type).toBe("test.event");
		});

		it("should emit event with hatId", () => {
			const bus = new EventBus();
			bus.emit("test.event", "tester-hat");

			const history = bus.getHistory();
			expect(history[0].hatId).toBe("tester-hat");
		});

		it("should emit event with data", () => {
			const bus = new EventBus();
			bus.emit("test.event", undefined, { key: "value" });

			const history = bus.getHistory();
			expect(history[0].data).toEqual({ key: "value" });
		});
	});

	describe("on/off", () => {
		it("should call listener when event is emitted", () => {
			const bus = new EventBus();
			const callback = mock(() => {});

			bus.on("test.event", callback);
			bus.emit("test.event");

			expect(callback).toHaveBeenCalledTimes(1);
			expect((callback.mock.calls[0] as unknown[])[0]).toHaveProperty(
				"type",
				"test.event",
			);
		});

		it("should call wildcard listener for all events", () => {
			const bus = new EventBus();
			const callback = mock(() => {});

			bus.on("*", callback);
			bus.emit("event.one");
			bus.emit("event.two");

			expect(callback).toHaveBeenCalledTimes(2);
		});

		it("should remove listener with off", () => {
			const bus = new EventBus();
			const callback = mock(() => {});

			bus.on("test.event", callback);
			bus.off("test.event", callback);
			bus.emit("test.event");

			expect(callback).not.toHaveBeenCalled();
		});
	});

	describe("getLastEvent", () => {
		it("should return undefined when history is empty", () => {
			const bus = new EventBus();
			expect(bus.getLastEvent()).toBeUndefined();
		});

		it("should return the most recent event", () => {
			const bus = new EventBus();
			bus.emit("first");
			bus.emit("second");
			bus.emit("third");

			expect(bus.getLastEvent()?.type).toBe("third");
		});
	});

	describe("findMatchingEvents", () => {
		it("should find exact match", () => {
			const bus = new EventBus();
			bus.emit("task.start");
			bus.emit("task.done");
			bus.emit("impl.done");

			const matches = bus.findMatchingEvents("task.done");
			expect(matches).toHaveLength(1);
			expect(matches[0].type).toBe("task.done");
		});

		it("should find events matching wildcard prefix", () => {
			const bus = new EventBus();
			bus.emit("task.start");
			bus.emit("task.done");
			bus.emit("impl.done");

			const matches = bus.findMatchingEvents("task.*");
			expect(matches).toHaveLength(2);
			expect(matches.map((e) => e.type)).toEqual(["task.start", "task.done"]);
		});

		it("should return all events for * pattern", () => {
			const bus = new EventBus();
			bus.emit("task.start");
			bus.emit("impl.done");

			const matches = bus.findMatchingEvents("*");
			expect(matches).toHaveLength(2);
		});
	});

	describe("clear", () => {
		it("should clear history and listeners", () => {
			const bus = new EventBus();
			const callback = mock(() => {});

			bus.on("test", callback);
			bus.emit("test");
			bus.clear();

			expect(bus.getHistory()).toHaveLength(0);

			bus.emit("test");
			expect(callback).toHaveBeenCalledTimes(1);
		});
	});
});
