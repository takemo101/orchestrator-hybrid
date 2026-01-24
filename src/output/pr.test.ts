import { describe, expect, it } from "bun:test";

describe("PR helper functions", () => {
	describe("generateBranchName", () => {
		function generateBranchName(issue: { number: number; title: string }): string {
			const sanitized = issue.title
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/^-|-$/g, "")
				.slice(0, 50);

			return `issue-${issue.number}-${sanitized}`;
		}

		it("should generate branch name from issue", () => {
			const issue = { number: 123, title: "Add new feature" };
			expect(generateBranchName(issue)).toBe("issue-123-add-new-feature");
		});

		it("should sanitize special characters", () => {
			const issue = { number: 1, title: "Fix: bug #42 (critical!)" };
			expect(generateBranchName(issue)).toBe("issue-1-fix-bug-42-critical");
		});

		it("should truncate long titles", () => {
			const issue = {
				number: 1,
				title:
					"This is a very long issue title that exceeds the maximum allowed length for branch names",
			};
			const result = generateBranchName(issue);
			expect(result.length).toBeLessThanOrEqual(60);
			expect(result.startsWith("issue-1-")).toBe(true);
		});

		it("should handle titles with leading/trailing special chars", () => {
			const issue = { number: 1, title: "---Fix bug---" };
			expect(generateBranchName(issue)).toBe("issue-1-fix-bug");
		});
	});

	describe("extractPRNumber", () => {
		function extractPRNumber(url: string): number {
			const match = url.match(/\/pull\/(\d+)/);
			return match ? Number.parseInt(match[1], 10) : 0;
		}

		it("should extract PR number from URL", () => {
			const url = "https://github.com/owner/repo/pull/42";
			expect(extractPRNumber(url)).toBe(42);
		});

		it("should return 0 for invalid URL", () => {
			expect(extractPRNumber("not-a-url")).toBe(0);
			expect(extractPRNumber("https://github.com/owner/repo")).toBe(0);
		});
	});

	describe("extractChangesFromScratchpad", () => {
		function extractChangesFromScratchpad(scratchpad: string): string {
			const progressMatch = scratchpad.match(/## Progress Log\n([\s\S]*?)(?=\n##|$)/);
			const decisionsMatch = scratchpad.match(/## Decisions Made\n([\s\S]*?)(?=\n##|$)/);

			const parts: string[] = [];

			if (progressMatch?.[1]?.trim()) {
				parts.push(progressMatch[1].trim());
			}

			if (decisionsMatch?.[1]?.trim()) {
				parts.push(`### Decisions\n${decisionsMatch[1].trim()}`);
			}

			if (parts.length === 0) {
				return "- Implementation completed as per issue requirements";
			}

			return parts.join("\n\n");
		}

		it("should extract progress log from scratchpad", () => {
			const scratchpad = `# Scratchpad

## Progress Log
- Added new feature
- Fixed bug

## Notes
Some notes here`;

			const result = extractChangesFromScratchpad(scratchpad);
			expect(result).toContain("Added new feature");
			expect(result).toContain("Fixed bug");
		});

		it("should extract decisions from scratchpad", () => {
			const scratchpad = `# Scratchpad

## Progress Log
- Work done

## Decisions Made
- Used React instead of Vue
- Chose PostgreSQL for database`;

			const result = extractChangesFromScratchpad(scratchpad);
			expect(result).toContain("### Decisions");
			expect(result).toContain("Used React instead of Vue");
		});

		it("should return default message when no content", () => {
			const scratchpad = `# Scratchpad

## Progress Log

## Decisions Made
`;

			const result = extractChangesFromScratchpad(scratchpad);
			expect(result).toBe("- Implementation completed as per issue requirements");
		});
	});
});
