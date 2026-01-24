import { describe, expect, it } from "bun:test";
import { EventBus } from "./event.js";
import {
	buildHatPrompt,
	extractPublishedEvent,
	type HatDefinition,
	HatRegistry,
} from "./hat.js";

describe("HatRegistry", () => {
	describe("register", () => {
		it("should register a hat", () => {
			const registry = new HatRegistry();
			registry.register("tester", {
				name: "🧪 Tester",
				triggers: ["task.start"],
				publishes: ["test.done"],
			});

			const hat = registry.get("tester");
			expect(hat).toBeDefined();
			expect(hat?.id).toBe("tester");
			expect(hat?.name).toBe("🧪 Tester");
		});
	});

	describe("registerFromConfig", () => {
		it("should register multiple hats from config", () => {
			const registry = new HatRegistry();
			registry.registerFromConfig({
				tester: {
					triggers: ["task.start"],
					publishes: ["test.done"],
				},
				implementer: {
					triggers: ["test.done"],
					publishes: ["impl.done"],
				},
			});

			expect(registry.getAll()).toHaveLength(2);
			expect(registry.get("tester")).toBeDefined();
			expect(registry.get("implementer")).toBeDefined();
		});
	});

	describe("findByTrigger", () => {
		it("should find hat by exact trigger match", () => {
			const registry = new HatRegistry();
			registry.register("tester", {
				triggers: ["task.start"],
				publishes: ["test.done"],
			});

			const hat = registry.findByTrigger("task.start");
			expect(hat?.id).toBe("tester");
		});

		it("should find hat by wildcard prefix trigger", () => {
			const registry = new HatRegistry();
			registry.register("handler", {
				triggers: ["task.*"],
				publishes: ["done"],
			});

			const hat = registry.findByTrigger("task.start");
			expect(hat?.id).toBe("handler");
		});

		it("should find hat by global wildcard trigger", () => {
			const registry = new HatRegistry();
			registry.register("catchall", {
				triggers: ["*"],
				publishes: ["handled"],
			});

			const hat = registry.findByTrigger("any.event");
			expect(hat?.id).toBe("catchall");
		});

		it("should return undefined when no hat matches", () => {
			const registry = new HatRegistry();
			registry.register("tester", {
				triggers: ["task.start"],
				publishes: ["test.done"],
			});

			const hat = registry.findByTrigger("unknown.event");
			expect(hat).toBeUndefined();
		});
	});

	describe("setActive/getActive", () => {
		it("should set and get active hat", () => {
			const registry = new HatRegistry();
			registry.register("tester", {
				triggers: ["task.start"],
				publishes: ["test.done"],
			});

			registry.setActive("tester");
			expect(registry.getActive()?.id).toBe("tester");
			expect(registry.getActiveId()).toBe("tester");
		});

		it("should clear active hat when set to null", () => {
			const registry = new HatRegistry();
			registry.register("tester", {
				triggers: ["task.start"],
				publishes: ["test.done"],
			});

			registry.setActive("tester");
			registry.setActive(null);

			expect(registry.getActive()).toBeUndefined();
			expect(registry.getActiveId()).toBeNull();
		});
	});
});

describe("buildHatPrompt", () => {
	it("should build prompt with hat instructions", () => {
		const hat: HatDefinition = {
			id: "tester",
			name: "🧪 Tester",
			triggers: ["task.start"],
			publishes: ["test.done", "test.failed"],
			instructions: "Write tests using vitest.",
		};

		const basePrompt = "Base prompt content";
		const eventBus = new EventBus();

		const result = buildHatPrompt(hat, basePrompt, {
			eventBus,
			iteration: 1,
		});

		expect(result).toContain("Current Role: 🧪 Tester");
		expect(result).toContain("Write tests using vitest.");
		expect(result).toContain("- test.done");
		expect(result).toContain("- test.failed");
		expect(result).toContain("EVENT: test.done");
		expect(result).toContain("Base prompt content");
	});

	it("should use hat id when name is not provided", () => {
		const hat: HatDefinition = {
			id: "tester",
			triggers: ["task.start"],
			publishes: ["test.done"],
		};

		const result = buildHatPrompt(hat, "", {
			eventBus: new EventBus(),
			iteration: 1,
		});

		expect(result).toContain("Current Role: tester");
	});
});

describe("extractPublishedEvent", () => {
	const hat: HatDefinition = {
		id: "tester",
		triggers: ["task.start"],
		publishes: ["test.done", "test.failed", "LOOP_COMPLETE"],
	};

	describe("EVENT: pattern variations", () => {
		it("should extract EVENT: pattern", () => {
			const output = "Some output\nEVENT: test.done\nMore output";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});

		it("should extract EVENT: pattern case insensitively", () => {
			const output = "event: test.done";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});

		it("should extract [EVENT] pattern", () => {
			const output = "Done! [EVENT] test.done";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});

		it("should extract **EVENT**: pattern (markdown bold)", () => {
			const output = "**EVENT**: test.done";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});

		it("should extract `EVENT: ...` pattern (inline code)", () => {
			const output = "Output: `EVENT: test.done`";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});

		it("should extract > EVENT: pattern (blockquote)", () => {
			const output = "> EVENT: test.done";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});
	});

	describe("multiple events", () => {
		it("should return first authorized event when multiple found", () => {
			const output =
				"EVENT: unauthorized.event\nEVENT: test.done\nEVENT: test.failed";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});
	});

	describe("keyword fallback", () => {
		it("should fallback to keyword search in last lines", () => {
			const output = "Tests passed!\ntest.done";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});

		it("should match keyword with quotes", () => {
			const output = 'Result: "test.done"';
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("test.done");
		});
	});

	describe("edge cases", () => {
		it("should return null when event is not authorized", () => {
			const output = "EVENT: unauthorized.event";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBeNull();
		});

		it("should return null when no event found", () => {
			const output = "Just some regular output without any events";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBeNull();
		});

		it("should extract LOOP_COMPLETE", () => {
			const output = "Task done! EVENT: LOOP_COMPLETE";
			const result = extractPublishedEvent(output, hat);
			expect(result).toBe("LOOP_COMPLETE");
		});

		it("should handle empty output", () => {
			const result = extractPublishedEvent("", hat);
			expect(result).toBeNull();
		});
	});
});
