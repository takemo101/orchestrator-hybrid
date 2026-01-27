import type { Backend } from "./base.js";
import { ClaudeBackend } from "./claude.js";
import { ContainerBackend, type ContainerConfig } from "./container.js";
import { OpenCodeBackend } from "./opencode.js";

export type BackendType = "claude" | "opencode" | "gemini" | "container";

export interface CreateBackendOptions {
	container?: ContainerConfig;
	workdir?: string;
}

export function createBackend(type: BackendType, options: CreateBackendOptions = {}): Backend {
	switch (type) {
		case "claude":
			return new ClaudeBackend({ workdir: options.workdir });
		case "opencode":
			return new OpenCodeBackend({ workdir: options.workdir });
		case "container":
			return new ContainerBackend(options.container);
		case "gemini":
			throw new Error("Gemini backend not yet implemented");
		default:
			throw new Error(`Unknown backend type: ${type}`);
	}
}

export type { Backend } from "./base.js";
export { ClaudeBackend } from "./claude.js";
export { ContainerBackend, type ContainerConfig } from "./container.js";
export { CustomBackend, type CustomBackendConfig } from "./custom-backend.js";
export { OpenCodeBackend } from "./opencode.js";
