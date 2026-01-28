import { describe, expect, it } from "bun:test";

describe("OpenCodeAdapter", () => {
	it("should export OpenCodeAdapter class", async () => {
		const { OpenCodeAdapter } = await import("./opencode");
		expect(OpenCodeAdapter).toBeDefined();
	});

	it("should implement IBackendAdapter interface", async () => {
		const { OpenCodeAdapter } = await import("./opencode");

		expect(typeof OpenCodeAdapter.prototype.getCommand).toBe("function");
		expect(typeof OpenCodeAdapter.prototype.getArgs).toBe("function");
		expect(typeof OpenCodeAdapter.prototype.getName).toBe("function");
	});

	describe("getCommand", () => {
		it("should return 'opencode'", async () => {
			const { OpenCodeAdapter } = await import("./opencode");
			const adapter = new OpenCodeAdapter();
			expect(adapter.getCommand()).toBe("opencode");
		});
	});

	describe("getArgs", () => {
		it("should return args with prompt path", async () => {
			const { OpenCodeAdapter } = await import("./opencode");
			const adapter = new OpenCodeAdapter();
			const args = adapter.getArgs(".agent/PROMPT.md");

			expect(args.some((arg: string) => arg.includes(".agent/PROMPT.md"))).toBe(true);
		});
	});

	describe("getName", () => {
		it("should return 'opencode'", async () => {
			const { OpenCodeAdapter } = await import("./opencode");
			const adapter = new OpenCodeAdapter();
			expect(adapter.getName()).toBe("opencode");
		});
	});
});
