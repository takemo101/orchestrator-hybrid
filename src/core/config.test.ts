import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import {
	ConfigValidationError,
	loadConfig,
	validateConfig,
} from "./config.js";

describe("config", () => {
	const testDir = ".test-config";
	const testConfigPath = `${testDir}/orch.yml`;

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("loadConfig", () => {
		it("should return default config when no config path provided and no config file exists", () => {
			const originalCwd = process.cwd();
			process.chdir(testDir);

			try {
				const config = loadConfig();

				expect(config.version).toBe("1.0");
				expect(config.backend.type).toBe("claude");
				expect(config.loop.max_iterations).toBe(100);
				expect(config.loop.completion_promise).toBe("LOOP_COMPLETE");
			} finally {
				process.chdir(originalCwd);
			}
		});

		it("should load config from specified path", () => {
			const configContent = `
version: "2.0"
backend:
  type: opencode
loop:
  max_iterations: 50
  completion_promise: DONE
`;
			writeFileSync(testConfigPath, configContent);

			const config = loadConfig(testConfigPath);

			expect(config.version).toBe("2.0");
			expect(config.backend.type).toBe("opencode");
			expect(config.loop.max_iterations).toBe(50);
			expect(config.loop.completion_promise).toBe("DONE");
		});

		it("should parse hats configuration", () => {
			const configContent = `
version: "1.0"
backend:
  type: claude
loop:
  max_iterations: 100
  completion_promise: LOOP_COMPLETE
hats:
  tester:
    name: "🧪 Tester"
    triggers:
      - task.start
      - impl.done
    publishes:
      - test.done
    instructions: "Write tests first"
`;
			writeFileSync(testConfigPath, configContent);

			const config = loadConfig(testConfigPath);

			expect(config.hats).toBeDefined();
			expect(config.hats?.tester).toBeDefined();
			expect(config.hats?.tester.name).toBe("🧪 Tester");
			expect(config.hats?.tester.triggers).toEqual(["task.start", "impl.done"]);
			expect(config.hats?.tester.publishes).toEqual(["test.done"]);
		});

		it("should parse gates configuration", () => {
			const configContent = `
version: "1.0"
backend:
  type: claude
loop:
  max_iterations: 100
  completion_promise: LOOP_COMPLETE
gates:
  after_plan: false
  after_implementation: true
  before_pr: true
`;
			writeFileSync(testConfigPath, configContent);

			const config = loadConfig(testConfigPath);

			expect(config.gates?.after_plan).toBe(false);
			expect(config.gates?.after_implementation).toBe(true);
			expect(config.gates?.before_pr).toBe(true);
		});

		it("should throw ConfigValidationError for invalid backend type", () => {
			const configContent = `
version: "1.0"
backend:
  type: invalid-backend
loop:
  max_iterations: 100
`;
			writeFileSync(testConfigPath, configContent);

			expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
		});

		it("should throw ConfigValidationError for invalid max_iterations type", () => {
			const configContent = `
version: "1.0"
backend:
  type: claude
loop:
  max_iterations: "not-a-number"
`;
			writeFileSync(testConfigPath, configContent);

			expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
		});

		it("should throw ConfigValidationError for invalid sandbox type", () => {
			const configContent = `
version: "1.0"
backend:
  type: claude
loop:
  max_iterations: 100
sandbox:
  type: invalid-sandbox
`;
			writeFileSync(testConfigPath, configContent);

			expect(() => loadConfig(testConfigPath)).toThrow(ConfigValidationError);
		});
	});

	describe("validateConfig", () => {
		it("should return valid config for correct input", () => {
			const input = {
				version: "1.0",
				backend: { type: "claude" },
				loop: {
					max_iterations: 100,
					completion_promise: "LOOP_COMPLETE",
				},
			};

			const result = validateConfig(input);

			expect(result.version).toBe("1.0");
			expect(result.backend.type).toBe("claude");
			expect(result.loop.max_iterations).toBe(100);
		});

		it("should throw ConfigValidationError with formatted message for invalid input", () => {
			const input = {
				version: "1.0",
				backend: { type: "invalid" },
				loop: {
					max_iterations: "not-a-number",
				},
			};

			try {
				validateConfig(input);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigValidationError);
				const validationError = error as ConfigValidationError;
				expect(validationError.message).toContain("設定ファイルエラー");
				expect(validationError.message).toContain("backend.type");
			}
		});

		it("should include file path in error message when provided", () => {
			const input = {
				backend: { type: "invalid" },
			};

			try {
				validateConfig(input, "custom-config.yml");
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigValidationError);
				const validationError = error as ConfigValidationError;
				expect(validationError.message).toContain("custom-config.yml");
			}
		});

		it("should validate sandbox configuration", () => {
			const validInput = {
				version: "1.0",
				backend: { type: "claude" },
				loop: { max_iterations: 100 },
				sandbox: {
					type: "docker",
					docker: { image: "node:20-alpine" },
				},
			};

			const result = validateConfig(validInput);

			expect(result.sandbox?.type).toBe("docker");
			expect(result.sandbox?.docker?.image).toBe("node:20-alpine");
		});

		it("should reject invalid sandbox type", () => {
			const invalidInput = {
				version: "1.0",
				backend: { type: "claude" },
				loop: { max_iterations: 100 },
				sandbox: { type: "invalid-type" },
			};

			expect(() => validateConfig(invalidInput)).toThrow(ConfigValidationError);
		});

		it("should validate autoIssue configuration", () => {
			const validInput = {
				version: "1.0",
				backend: { type: "claude" },
				loop: { max_iterations: 100 },
				autoIssue: {
					enabled: true,
					minPriority: "high",
					labels: ["auto", "improvement"],
				},
			};

			const result = validateConfig(validInput);

			expect(result.autoIssue?.enabled).toBe(true);
			expect(result.autoIssue?.minPriority).toBe("high");
			expect(result.autoIssue?.labels).toEqual(["auto", "improvement"]);
		});

		it("should format multiple errors in message", () => {
			const input = {
				backend: { type: 123 }, // Invalid type (number instead of string enum)
				loop: {
					max_iterations: "invalid", // Invalid type
					idle_timeout_secs: "also-invalid", // Invalid type
				},
			};

			try {
				validateConfig(input);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigValidationError);
				const validationError = error as ConfigValidationError;
				// Should contain multiple error lines
				const lines = validationError.message.split("\n");
				expect(lines.length).toBeGreaterThan(2);
			}
		});
	});

	describe("ConfigValidationError", () => {
		it("should expose errors array", () => {
			const input = {
				backend: { type: "invalid" },
			};

			try {
				validateConfig(input);
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigValidationError);
				const validationError = error as ConfigValidationError;
				expect(validationError.errors).toBeDefined();
				expect(validationError.errors.length).toBeGreaterThan(0);
			}
		});

		it("should have configPath property when provided", () => {
			const input = {
				backend: { type: "invalid" },
			};

			try {
				validateConfig(input, "my-config.yml");
			} catch (error) {
				expect(error).toBeInstanceOf(ConfigValidationError);
				const validationError = error as ConfigValidationError;
				expect(validationError.configPath).toBe("my-config.yml");
			}
		});
	});
});
