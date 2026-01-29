import { describe, expect, it } from "bun:test";

describe("PiAdapter", () => {
	it("should export PiAdapter class", async () => {
		const { PiAdapter } = await import("./pi");
		expect(PiAdapter).toBeDefined();
	});

	it("should implement IBackendAdapter interface", async () => {
		const { PiAdapter } = await import("./pi");

		expect(typeof PiAdapter.prototype.getCommand).toBe("function");
		expect(typeof PiAdapter.prototype.getArgs).toBe("function");
		expect(typeof PiAdapter.prototype.getName).toBe("function");
	});

	describe("getCommand", () => {
		it("should return 'pi'", async () => {
			const { PiAdapter } = await import("./pi");
			const adapter = new PiAdapter();
			expect(adapter.getCommand()).toBe("pi");
		});
	});

	describe("getArgs", () => {
		it("should return args with @-prefixed prompt path", async () => {
			const { PiAdapter } = await import("./pi");
			const adapter = new PiAdapter();
			const args = adapter.getArgs(".agent/PROMPT.md");

			expect(args).toEqual(["@.agent/PROMPT.md"]);
		});

		it("should include --model when model option is provided", async () => {
			const { PiAdapter } = await import("./pi");
			const adapter = new PiAdapter();
			const args = adapter.getArgs(".agent/PROMPT.md", { model: "claude-sonnet-4" });

			expect(args).toContain("--model");
			expect(args).toContain("claude-sonnet-4");
		});

		it("should not include --model when model option is undefined", async () => {
			const { PiAdapter } = await import("./pi");
			const adapter = new PiAdapter();
			const args = adapter.getArgs(".agent/PROMPT.md", {});

			expect(args).not.toContain("--model");
		});
	});

	describe("getName", () => {
		it("should return 'pi'", async () => {
			const { PiAdapter } = await import("./pi");
			const adapter = new PiAdapter();
			expect(adapter.getName()).toBe("pi");
		});
	});
});
