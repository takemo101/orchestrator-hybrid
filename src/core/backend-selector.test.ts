import { describe, expect, it } from "bun:test";
import type { Backend } from "../adapters/base.js";
import { type BackendFactories, BackendSelector } from "./backend-selector.js";
import type { Config } from "./types.js";

const createMockBackend = (name: string): Backend => ({
	name,
	execute: async () => ({ output: "", exitCode: 0 }),
});

const mockFactories: BackendFactories = {
	createGemini: () => createMockBackend("gemini"),
	createClaude: () => createMockBackend("claude"),
	createKiro: (config) => {
		const backend = createMockBackend("kiro") as Backend & { config: typeof config };
		backend.config = config;
		return backend;
	},
};

describe("BackendSelector", () => {
	const baseConfig: Config = {
		version: "1.0",
		backend: { type: "claude" },
		loop: { max_iterations: 1, completion_promise: "DONE", idle_timeout_secs: 1 },
		hats: {},
	} as any;

	it("selectBackend: Hat未定義時はグローバルバックエンドを使用", () => {
		const selector = new BackendSelector(baseConfig, mockFactories);
		const backend = selector.selectBackend("unknown-hat");
		expect(backend.name).toBe("claude");
	});

	it("selectBackend: Hat固有のNamed backend (gemini) を返す", () => {
		const config = {
			...baseConfig,
			hats: {
				"test-hat": {
					triggers: [],
					publishes: [],
					backend: "gemini",
				},
			},
		} as any;
		const selector = new BackendSelector(config, mockFactories);
		const backend = selector.selectBackend("test-hat");
		expect(backend.name).toBe("gemini");
	});

	it("selectBackend: Hat固有のKiro backendを返す", () => {
		const config = {
			...baseConfig,
			hats: {
				"kiro-hat": {
					triggers: [],
					publishes: [],
					backend: { type: "kiro", agent: "test-agent" },
				},
			},
		} as any;
		const selector = new BackendSelector(config, mockFactories);
		const backend = selector.selectBackend("kiro-hat");
		expect(backend.name).toBe("kiro");
		expect((backend as any).config.agent).toBe("test-agent");
	});
});
