import type { Backend } from "./base.js";
import { ClaudeBackend } from "./claude.js";
import { OpenCodeBackend } from "./opencode.js";

export type BackendType = "claude" | "opencode" | "gemini";

export interface CreateBackendOptions {
	workdir?: string;
}

export function createBackend(type: BackendType, options: CreateBackendOptions = {}): Backend {
	switch (type) {
		case "claude":
			return new ClaudeBackend({ workdir: options.workdir });
		case "opencode":
			return new OpenCodeBackend({ workdir: options.workdir });
		case "gemini":
			throw new Error("Gemini backend not yet implemented");
		default:
			throw new Error(`Unknown backend type: ${type}`);
	}
}

export type { Backend } from "./base.js";
export { ClaudeBackend } from "./claude.js";
export { CustomBackend, type CustomBackendConfig } from "./custom-backend.js";
export { OpenCodeBackend } from "./opencode.js";
