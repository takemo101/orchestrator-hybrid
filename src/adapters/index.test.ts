import { describe, expect, it } from "vitest";
import { ClaudeBackend } from "./claude.js";
import { ContainerBackend } from "./container.js";
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

	it("should create ContainerBackend for 'container' type", () => {
		const backend = createBackend("container");
		expect(backend).toBeInstanceOf(ContainerBackend);
		expect(backend.name).toBe("container");
	});

	it("should create ContainerBackend with custom config", () => {
		const backend = createBackend("container", {
			container: {
				image: "python:3.11",
				workdir: "/custom/path",
			},
		});
		expect(backend).toBeInstanceOf(ContainerBackend);
	});

	it("should throw error for 'gemini' (not implemented)", () => {
		expect(() => createBackend("gemini")).toThrow(
			"Gemini backend not yet implemented",
		);
	});

	it("should throw error for unknown backend type", () => {
		expect(() => createBackend("unknown" as "claude")).toThrow(
			"Unknown backend type: unknown",
		);
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

describe("ContainerBackend", () => {
	it("should have correct name", () => {
		const backend = new ContainerBackend();
		expect(backend.name).toBe("container");
	});

	it("should initialize with default values", () => {
		const backend = new ContainerBackend();
		expect(backend.getEnvironmentId()).toBeNull();
	});

	it("should accept custom config", () => {
		const backend = new ContainerBackend({
			image: "python:3.11",
			envId: "existing-env-123",
		});
		expect(backend.getEnvironmentId()).toBe("existing-env-123");
	});
});
