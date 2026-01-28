import { describe, expect, it } from "bun:test";

describe("ClaudeAdapter", () => {
	it("should export ClaudeAdapter class", async () => {
		const { ClaudeAdapter } = await import("./claude");
		expect(ClaudeAdapter).toBeDefined();
	});

	it("should implement IBackendAdapter interface", async () => {
		const { ClaudeAdapter } = await import("./claude");

		expect(typeof ClaudeAdapter.prototype.getCommand).toBe("function");
		expect(typeof ClaudeAdapter.prototype.getArgs).toBe("function");
		expect(typeof ClaudeAdapter.prototype.getName).toBe("function");
	});

	describe("getCommand", () => {
		it("should return 'claude'", async () => {
			const { ClaudeAdapter } = await import("./claude");
			const adapter = new ClaudeAdapter();
			expect(adapter.getCommand()).toBe("claude");
		});
	});

	describe("getArgs", () => {
		it("should return args with --print-prompt and prompt path", async () => {
			const { ClaudeAdapter } = await import("./claude");
			const adapter = new ClaudeAdapter();
			const args = adapter.getArgs(".agent/PROMPT.md");

			expect(args).toContain("--print");
			expect(args).toContain(".agent/PROMPT.md");
		});
	});

	describe("getName", () => {
		it("should return 'claude'", async () => {
			const { ClaudeAdapter } = await import("./claude");
			const adapter = new ClaudeAdapter();
			expect(adapter.getName()).toBe("claude");
		});
	});
});
