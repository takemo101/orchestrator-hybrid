import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigMerger } from "./config-merger.js";

describe("ConfigMerger", () => {
	const testDir = ".test-fixtures";
	const testConfigPath = path.join(testDir, "orch.yml");

	beforeEach(() => {
		// Create test directory
		if (!fs.existsSync(testDir)) {
			fs.mkdirSync(testDir, { recursive: true });
		}
	});

	afterEach(() => {
		// Cleanup test files
		if (fs.existsSync(testDir)) {
			fs.rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe("merge", () => {
		it("should prioritize CLI options over file config", () => {
			// Create config file with auto_mode: false
			const configContent = `
version: "1.0"
run:
  auto_mode: false
  create_pr: true
  draft_pr: false
backend:
  type: claude
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: { auto_mode: true },
				configPath: testConfigPath,
			});

			expect(result.auto_mode).toBe(true);
			expect(result.create_pr).toBe(true);
			expect(result.draft_pr).toBe(false);
		});

		it("should use file config when CLI option is not provided", () => {
			const configContent = `
version: "1.0"
run:
  auto_mode: true
  create_pr: true
  draft_pr: true
backend:
  type: claude
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
				configPath: testConfigPath,
			});

			expect(result.auto_mode).toBe(true);
			expect(result.create_pr).toBe(true);
			expect(result.draft_pr).toBe(true);
		});

		it("should use default values when both are not provided", () => {
			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
			});

			expect(result.auto_mode).toBe(false);
			expect(result.create_pr).toBe(false);
			expect(result.draft_pr).toBe(false);
		});

		it("should use default values when config file does not exist", () => {
			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
				configPath: "non-existent-config.yml",
			});

			expect(result.auto_mode).toBe(false);
			expect(result.create_pr).toBe(false);
			expect(result.draft_pr).toBe(false);
		});

		it("should handle partial file config", () => {
			const configContent = `
version: "1.0"
run:
  auto_mode: true
backend:
  type: claude
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
				configPath: testConfigPath,
			});

			expect(result.auto_mode).toBe(true);
			expect(result.create_pr).toBe(false);
			expect(result.draft_pr).toBe(false);
		});

		it("should handle invalid YAML gracefully", () => {
			const configContent = `
invalid yaml content: [
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
				configPath: testConfigPath,
			});

			// Should fall back to defaults
			expect(result.auto_mode).toBe(false);
			expect(result.create_pr).toBe(false);
			expect(result.draft_pr).toBe(false);
		});

		it("should handle config without run section", () => {
			const configContent = `
version: "1.0"
backend:
  type: claude
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
				configPath: testConfigPath,
			});

			expect(result.auto_mode).toBe(false);
			expect(result.create_pr).toBe(false);
			expect(result.draft_pr).toBe(false);
		});

		it("should handle invalid run config types", () => {
			const configContent = `
version: "1.0"
run:
  auto_mode: "not-a-boolean"
  create_pr: 123
backend:
  type: claude
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {},
				configPath: testConfigPath,
			});

			// Should fall back to defaults for invalid values
			expect(result.auto_mode).toBe(false);
			expect(result.create_pr).toBe(false);
			expect(result.draft_pr).toBe(false);
		});

		it("should allow CLI options to override all file values", () => {
			const configContent = `
version: "1.0"
run:
  auto_mode: false
  create_pr: false
  draft_pr: false
backend:
  type: claude
`;
			fs.writeFileSync(testConfigPath, configContent);

			const merger = new ConfigMerger();
			const result = merger.merge({
				cliOptions: {
					auto_mode: true,
					create_pr: true,
					draft_pr: true,
				},
				configPath: testConfigPath,
			});

			expect(result.auto_mode).toBe(true);
			expect(result.create_pr).toBe(true);
			expect(result.draft_pr).toBe(true);
		});
	});

	describe("getDefaults", () => {
		it("should return default RunConfig values", () => {
			const merger = new ConfigMerger();
			const defaults = merger.getDefaults();

			expect(defaults.auto_mode).toBe(false);
			expect(defaults.create_pr).toBe(false);
			expect(defaults.draft_pr).toBe(false);
		});
	});
});
