import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { loadConfig, validateConfig, ConfigValidationError } from "./config.js";

const TEST_DIR = "/tmp/orch-config-test";

describe("config", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
	});

	describe("validateConfig", () => {
		test("should validate minimal config", () => {
			const config = validateConfig({});
			expect(config.backend).toBe("claude");
			expect(config.auto).toBe(false);
			expect(config.max_iterations).toBe(100);
		});

		test("should validate full config", () => {
			const config = validateConfig({
				backend: "opencode",
				auto: true,
				create_pr: true,
				max_iterations: 50,
				preset: "tdd",
				worktree: {
					enabled: false,
					base_dir: ".wt",
					copy_files: [],
				},
				session: {
					manager: "tmux",
					prefix: "test",
					capture_interval: 200,
				},
			});
			expect(config.backend).toBe("opencode");
			expect(config.auto).toBe(true);
			expect(config.worktree.enabled).toBe(false);
			expect(config.session.manager).toBe("tmux");
		});

		test("should throw ConfigValidationError for invalid config", () => {
			expect(() => validateConfig({ backend: "invalid" })).toThrow(
				ConfigValidationError,
			);
		});

		test("should include configPath in error", () => {
			try {
				validateConfig({ backend: "invalid" }, "orch.yml");
				expect(true).toBe(false); // should not reach
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigValidationError);
				if (error instanceof ConfigValidationError) {
					expect(error.configPath).toBe("orch.yml");
					expect(error.errors.length).toBeGreaterThan(0);
				}
			}
		});
	});

	describe("loadConfig", () => {
		test("should return defaults when no config file", () => {
			const config = loadConfig(`${TEST_DIR}/nonexistent.yml`);
			expect(config.backend).toBe("claude");
			expect(config.auto).toBe(false);
		});

		test("should load config from yaml file", () => {
			const configPath = `${TEST_DIR}/orch.yml`;
			writeFileSync(
				configPath,
				`backend: opencode
auto: true
max_iterations: 30
`,
			);
			const config = loadConfig(configPath);
			expect(config.backend).toBe("opencode");
			expect(config.auto).toBe(true);
			expect(config.max_iterations).toBe(30);
		});

		test("should throw for invalid yaml config", () => {
			const configPath = `${TEST_DIR}/bad.yml`;
			writeFileSync(configPath, "backend: invalid\n");
			expect(() => loadConfig(configPath)).toThrow(ConfigValidationError);
		});
	});

	describe("ConfigValidationError", () => {
		test("should expose errors array", () => {
			try {
				validateConfig({ backend: "bad", max_iterations: -5 });
			} catch (error) {
				if (error instanceof ConfigValidationError) {
					expect(error.errors.length).toBeGreaterThan(0);
					expect(error.errors[0]).toHaveProperty("path");
					expect(error.errors[0]).toHaveProperty("message");
				}
			}
		});

		test("should be instanceof Error", () => {
			const err = new ConfigValidationError(
				[{ path: "backend", message: "invalid" }],
			);
			expect(err).toBeInstanceOf(Error);
			expect(err.name).toBe("ConfigValidationError");
		});
	});
});
