import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { logger } from "./logger.js";
import { MODEL_ALIASES, ModelSelector } from "./model-selector.js";
import type { Config } from "./types.js";

describe("ModelSelector", () => {
	const baseConfig: Config = {
		version: "1.0",
		backend: {
			type: "claude",
		},
		loop: {
			max_iterations: 100,
			completion_promise: "LOOP_COMPLETE",
			idle_timeout_secs: 1800,
		},
	};

	describe("MODEL_ALIASES", () => {
		test("defines opus alias", () => {
			expect(MODEL_ALIASES.opus).toBe("claude-opus-4-20250514");
		});

		test("defines sonnet alias", () => {
			expect(MODEL_ALIASES.sonnet).toBe("claude-sonnet-4-20250514");
		});

		test("defines haiku alias", () => {
			expect(MODEL_ALIASES.haiku).toBe("claude-haiku-3-20240307");
		});
	});

	describe("constructor", () => {
		test("creates instance with config", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector).toBeInstanceOf(ModelSelector);
		});
	});

	describe("resolveModel", () => {
		test("returns hat-specific model when defined", () => {
			const config: Config = {
				...baseConfig,
				hats: {
					planner: {
						triggers: ["task.start"],
						publishes: ["plan.ready"],
						model: "opus",
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("planner")).toBe("opus");
		});

		test("returns global model when hat model not defined", () => {
			const config: Config = {
				...baseConfig,
				backend: {
					type: "claude",
					model: "sonnet",
				},
				hats: {
					implementer: {
						triggers: ["plan.ready"],
						publishes: ["code.written"],
						// no model specified
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("implementer")).toBe("sonnet");
		});

		test("returns default model when no model defined", () => {
			const config: Config = {
				...baseConfig,
				hats: {
					reviewer: {
						triggers: ["code.written"],
						publishes: ["LOOP_COMPLETE"],
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("reviewer")).toBe("sonnet");
		});

		test("returns default model for non-existent hat", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.resolveModel("nonexistent")).toBe("sonnet");
		});

		test("prioritizes hat model over global model", () => {
			const config: Config = {
				...baseConfig,
				backend: {
					type: "claude",
					model: "haiku",
				},
				hats: {
					planner: {
						triggers: ["task.start"],
						publishes: ["plan.ready"],
						model: "opus",
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("planner")).toBe("opus");
		});

		test("handles full model name", () => {
			const config: Config = {
				...baseConfig,
				hats: {
					custom: {
						triggers: ["custom.event"],
						publishes: ["done"],
						model: "claude-sonnet-4-5-20250929",
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("custom")).toBe("claude-sonnet-4-5-20250929");
		});
	});

	describe("resolveModelWithOverride", () => {
		test("returns override when provided", () => {
			const config: Config = {
				...baseConfig,
				backend: {
					type: "claude",
					model: "sonnet",
				},
				hats: {
					planner: {
						triggers: ["task.start"],
						publishes: ["plan.ready"],
						model: "opus",
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModelWithOverride("planner", "haiku")).toBe("haiku");
		});

		test("falls back to resolveModel when override is undefined", () => {
			const config: Config = {
				...baseConfig,
				hats: {
					planner: {
						triggers: ["task.start"],
						publishes: ["plan.ready"],
						model: "opus",
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModelWithOverride("planner", undefined)).toBe("opus");
		});
	});

	describe("expandAlias", () => {
		test("expands opus alias", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.expandAlias("opus")).toBe("claude-opus-4-20250514");
		});

		test("expands sonnet alias", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.expandAlias("sonnet")).toBe("claude-sonnet-4-20250514");
		});

		test("expands haiku alias", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.expandAlias("haiku")).toBe("claude-haiku-3-20240307");
		});

		test("returns full model name unchanged", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.expandAlias("claude-sonnet-4-5-20250929")).toBe("claude-sonnet-4-5-20250929");
		});
	});

	describe("isValidModel", () => {
		test("returns true for known aliases", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.isValidModel("opus")).toBe(true);
			expect(selector.isValidModel("sonnet")).toBe(true);
			expect(selector.isValidModel("haiku")).toBe(true);
		});

		test("returns true for full model names starting with claude-", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.isValidModel("claude-sonnet-4-5-20250929")).toBe(true);
			expect(selector.isValidModel("claude-opus-4-20250514")).toBe(true);
		});

		test("returns false for invalid model names", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.isValidModel("gpt-4")).toBe(false);
			expect(selector.isValidModel("invalid")).toBe(false);
			expect(selector.isValidModel("")).toBe(false);
		});
	});

	describe("getDefaultModel", () => {
		test("returns sonnet as default", () => {
			const selector = new ModelSelector(baseConfig);
			expect(selector.getDefaultModel()).toBe("sonnet");
		});
	});

	describe("edge cases", () => {
		let warnSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			warnSpy = spyOn(logger, "warn").mockImplementation(() => {});
		});

		afterEach(() => {
			warnSpy.mockRestore();
		});

		test("logs warning for invalid hat model and falls back to global", () => {
			const config: Config = {
				...baseConfig,
				backend: {
					type: "claude",
					model: "sonnet",
				},
				hats: {
					invalid: {
						triggers: ["event"],
						publishes: ["done"],
						model: "gpt-4", // invalid for Claude backend
					},
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("invalid")).toBe("sonnet");
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid model"));
		});

		test("logs warning for invalid global model and falls back to default", () => {
			const config: Config = {
				...baseConfig,
				backend: {
					type: "claude",
					model: "invalid-model",
				},
			};
			const selector = new ModelSelector(config);
			expect(selector.resolveModel("anyhat")).toBe("sonnet");
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Invalid model"));
		});
	});
});
