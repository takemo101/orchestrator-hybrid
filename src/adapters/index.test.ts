import { describe, expect, it } from "bun:test";
import { ClaudeBackend } from "./claude.js";
import { createBackend } from "./index.js";
import { OpenCodeBackend } from "./opencode.js";

describe("createBackend", () => {
	it("should create ClaudeBackend for 'claude' type", () => {
		const backend = createBackend("claude");
		expect(backend).toBeInstanceOf(ClaudeBackend);
		expect(backend.name).toBe("claude");
	});

	it("should create OpenCodeBackend for 'opencode' type", () => {
		const backend = createBackend("opencode");
		expect(backend).toBeInstanceOf(OpenCodeBackend);
		expect(backend.name).toBe("opencode");
	});

	it("should throw error for 'gemini' (not implemented)", () => {
		expect(() => createBackend("gemini")).toThrow("Gemini backend not yet implemented");
	});

	it("should throw error for unknown backend type", () => {
		expect(() => createBackend("unknown" as "claude")).toThrow("Unknown backend type: unknown");
	});
});

describe("ClaudeBackend", () => {
	it("should have correct name", () => {
		const backend = new ClaudeBackend();
		expect(backend.name).toBe("claude");
	});
});

describe("OpenCodeBackend", () => {
	it("should have correct name", () => {
		const backend = new OpenCodeBackend();
		expect(backend.name).toBe("opencode");
	});
});
