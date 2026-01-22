import { existsSync, readFileSync, rmSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Issue } from "../core/types.js";
import { generatePrompt } from "./prompt.js";

describe("generatePrompt", () => {
	const testDir = ".test-prompt";
	const testPath = `${testDir}/PROMPT.md`;

	const mockIssue: Issue = {
		number: 42,
		title: "Add user authentication",
		body: "Implement login and logout functionality.\n\n- Support email/password\n- Add session management",
		labels: ["feature", "priority:high"],
		state: "open",
	};

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

	it("should generate prompt file with issue content", () => {
		generatePrompt(
			{
				issue: mockIssue,
				completionPromise: "LOOP_COMPLETE",
				scratchpadPath: ".agent/scratchpad.md",
			},
			testPath,
		);

		expect(existsSync(testPath)).toBe(true);

		const content = readFileSync(testPath, "utf-8");
		expect(content).toContain("# Task: Add user authentication");
		expect(content).toContain("feature, priority:high");
		expect(content).toContain("Implement login and logout functionality.");
		expect(content).toContain("LOOP_COMPLETE");
		expect(content).toContain(".agent/scratchpad.md");
	});

	it("should handle issue with no labels", () => {
		const issueNoLabels: Issue = {
			...mockIssue,
			labels: [],
		};

		generatePrompt(
			{
				issue: issueNoLabels,
				completionPromise: "DONE",
				scratchpadPath: ".agent/scratchpad.md",
			},
			testPath,
		);

		const content = readFileSync(testPath, "utf-8");
		expect(content).toContain("(none)");
	});

	it("should handle issue with empty body", () => {
		const issueEmptyBody: Issue = {
			...mockIssue,
			body: "",
		};

		generatePrompt(
			{
				issue: issueEmptyBody,
				completionPromise: "LOOP_COMPLETE",
				scratchpadPath: ".agent/scratchpad.md",
			},
			testPath,
		);

		expect(existsSync(testPath)).toBe(true);
		const content = readFileSync(testPath, "utf-8");
		expect(content).toContain("## Description");
	});

	it("should create nested directories if needed", () => {
		const nestedPath = `${testDir}/nested/deep/PROMPT.md`;

		generatePrompt(
			{
				issue: mockIssue,
				completionPromise: "LOOP_COMPLETE",
				scratchpadPath: ".agent/scratchpad.md",
			},
			nestedPath,
		);

		expect(existsSync(nestedPath)).toBe(true);
	});

	it("should include custom completion promise", () => {
		generatePrompt(
			{
				issue: mockIssue,
				completionPromise: "TASK_FINISHED",
				scratchpadPath: ".agent/scratchpad.md",
			},
			testPath,
		);

		const content = readFileSync(testPath, "utf-8");
		expect(content).toContain("TASK_FINISHED");
		expect(content).not.toContain("LOOP_COMPLETE");
	});

	it("should include custom scratchpad path", () => {
		generatePrompt(
			{
				issue: mockIssue,
				completionPromise: "LOOP_COMPLETE",
				scratchpadPath: "custom/path/notes.md",
			},
			testPath,
		);

		const content = readFileSync(testPath, "utf-8");
		expect(content).toContain("custom/path/notes.md");
	});
});
