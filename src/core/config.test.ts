import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { loadConfig } from "./config.js";

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
	});
});
