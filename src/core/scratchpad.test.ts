import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	appendToScratchpad,
	initScratchpad,
	readScratchpad,
} from "./scratchpad.js";

describe("scratchpad", () => {
	const testDir = ".test-scratchpad";
	const testPath = `${testDir}/scratchpad.md`;

	beforeEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("initScratchpad", () => {
		it("should create scratchpad file with initial content", () => {
			initScratchpad(testPath);

			expect(existsSync(testPath)).toBe(true);
			const content = readFileSync(testPath, "utf-8");
			expect(content).toContain("# Scratchpad");
			expect(content).toContain("## Current Status");
			expect(content).toContain("## Progress Log");
		});

		it("should not overwrite existing scratchpad", () => {
			mkdirSync(testDir, { recursive: true });
			const customContent = "# Custom Scratchpad";
			require("node:fs").writeFileSync(testPath, customContent);

			initScratchpad(testPath);

			const content = readFileSync(testPath, "utf-8");
			expect(content).toBe(customContent);
		});
	});

	describe("readScratchpad", () => {
		it("should return (empty) when file does not exist", () => {
			const content = readScratchpad(testPath);
			expect(content).toBe("(empty)");
		});

		it("should return file content when file exists", () => {
			initScratchpad(testPath);
			const content = readScratchpad(testPath);
			expect(content).toContain("# Scratchpad");
		});
	});

	describe("appendToScratchpad", () => {
		it("should append content to existing scratchpad", () => {
			initScratchpad(testPath);
			appendToScratchpad(testPath, "## New Section");

			const content = readFileSync(testPath, "utf-8");
			expect(content).toContain("## New Section");
		});

		it("should create file and append when file does not exist", () => {
			mkdirSync(testDir, { recursive: true });
			appendToScratchpad(testPath, "Initial content");

			expect(existsSync(testPath)).toBe(true);
			const content = readFileSync(testPath, "utf-8");
			expect(content).toContain("Initial content");
		});
	});
});
