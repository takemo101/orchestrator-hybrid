import type { Backend } from "./base.js";
import { ClaudeBackend } from "./claude.js";
import { OpenCodeBackend } from "./opencode.js";

export type BackendType = "claude" | "opencode" | "gemini";

export function createBackend(type: BackendType): Backend {
	switch (type) {
		case "claude":
			return new ClaudeBackend();
		case "opencode":
			return new OpenCodeBackend();
		case "gemini":
			throw new Error("Gemini backend not yet implemented");
		default:
			throw new Error(`Unknown backend type: ${type}`);
	}
}

export type { Backend } from "./base.js";
export { ClaudeBackend } from "./claude.js";
export { OpenCodeBackend } from "./opencode.js";
