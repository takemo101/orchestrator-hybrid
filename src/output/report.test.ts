import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import {
	createReportCollector,
	generateReport,
	type ReportData,
} from "./report.js";

describe("report", () => {
	const testDir = ".test-report";

	beforeEach(() => {
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe("generateReport", () => {
		it("should generate markdown and JSON reports", () => {
			const data: ReportData = {
				issue: {
					number: 42,
					title: "Test Issue",
					body: "Test body",
					labels: ["bug"],
					state: "open",
				},
				startTime: new Date("2025-01-01T10:00:00Z"),
				endTime: new Date("2025-01-01T10:05:00Z"),
				totalIterations: 3,
				successful: true,
				completionReason: "completed",
				iterations: [
					{
						iteration: 1,
						hatId: "tester",
						hatName: "Tester",
						startTime: new Date("2025-01-01T10:00:00Z"),
						endTime: new Date("2025-01-01T10:01:00Z"),
						durationMs: 60000,
						exitCode: 0,
						publishedEvent: "test.done",
					},
					{
						iteration: 2,
						hatId: "implementer",
						hatName: "Implementer",
						startTime: new Date("2025-01-01T10:01:00Z"),
						endTime: new Date("2025-01-01T10:03:00Z"),
						durationMs: 120000,
						exitCode: 0,
						publishedEvent: "impl.done",
					},
					{
						iteration: 3,
						hatId: "reviewer",
						hatName: "Reviewer",
						startTime: new Date("2025-01-01T10:03:00Z"),
						endTime: new Date("2025-01-01T10:05:00Z"),
						durationMs: 120000,
						exitCode: 0,
						publishedEvent: "LOOP_COMPLETE",
					},
				],
				events: [
					{
						type: "task.start",
						timestamp: new Date("2025-01-01T10:00:00Z"),
						hatId: undefined,
					},
					{
						type: "test.done",
						timestamp: new Date("2025-01-01T10:01:00Z"),
						hatId: "tester",
					},
				],
				config: {
					backend: "claude",
					maxIterations: 100,
					completionPromise: "LOOP_COMPLETE",
					useContainer: false,
					preset: "tdd",
				},
			};

			const outputPath = `${testDir}/report.md`;
			generateReport(data, outputPath);

			expect(existsSync(outputPath)).toBe(true);
			const markdown = readFileSync(outputPath, "utf-8");
			expect(markdown).toContain("# Orchestration Report");
			expect(markdown).toContain("#42: Test Issue");
			expect(markdown).toContain("✅ Completed");
			expect(markdown).toContain("5m 0s");
			expect(markdown).toContain("| 1 | Tester |");
			expect(markdown).toContain("| 2 | Implementer |");
			expect(markdown).toContain("| 3 | Reviewer |");

			const jsonPath = `${testDir}/report.json`;
			expect(existsSync(jsonPath)).toBe(true);
			const json = JSON.parse(readFileSync(jsonPath, "utf-8"));
			expect(json.issue.number).toBe(42);
			expect(json.totalIterations).toBe(3);
			expect(json.successful).toBe(true);
		});

		it("should handle failed report", () => {
			const data: ReportData = {
				issue: {
					number: 1,
					title: "Failed Issue",
					body: "Body",
					labels: [],
					state: "open",
				},
				startTime: new Date("2025-01-01T10:00:00Z"),
				endTime: new Date("2025-01-01T10:10:00Z"),
				totalIterations: 100,
				successful: false,
				completionReason: "max_iterations",
				iterations: [],
				events: [],
				config: {
					backend: "opencode",
					maxIterations: 100,
					completionPromise: "LOOP_COMPLETE",
					useContainer: true,
				},
			};

			const outputPath = `${testDir}/failed-report.md`;
			generateReport(data, outputPath);

			const markdown = readFileSync(outputPath, "utf-8");
			expect(markdown).toContain("❌ Failed");
			expect(markdown).toContain("Maximum iterations reached");
			expect(markdown).toContain("Container | Yes");
		});

		it("should include PR info when created", () => {
			const data: ReportData = {
				issue: {
					number: 10,
					title: "PR Issue",
					body: "",
					labels: [],
					state: "open",
				},
				startTime: new Date(),
				endTime: new Date(),
				totalIterations: 1,
				successful: true,
				completionReason: "completed",
				iterations: [],
				events: [],
				config: {
					backend: "claude",
					maxIterations: 100,
					completionPromise: "LOOP_COMPLETE",
					useContainer: false,
				},
				prCreated: {
					url: "https://github.com/org/repo/pull/123",
					number: 123,
					branch: "feature/test",
				},
			};

			const outputPath = `${testDir}/pr-report.md`;
			generateReport(data, outputPath);

			const markdown = readFileSync(outputPath, "utf-8");
			expect(markdown).toContain("## Pull Request");
			expect(markdown).toContain("https://github.com/org/repo/pull/123");
			expect(markdown).toContain("#123");
			expect(markdown).toContain("feature/test");
		});
	});

	describe("ReportCollector", () => {
		it("should record iterations", () => {
			const collector = createReportCollector();

			collector.recordIteration({
				hatId: "tester",
				hatName: "Tester",
				startTime: new Date("2025-01-01T10:00:00Z"),
				endTime: new Date("2025-01-01T10:01:00Z"),
				durationMs: 60000,
				exitCode: 0,
				publishedEvent: "test.done",
			});

			collector.recordIteration({
				hatId: "implementer",
				startTime: new Date("2025-01-01T10:01:00Z"),
				endTime: new Date("2025-01-01T10:02:00Z"),
				durationMs: 60000,
				exitCode: 0,
			});

			const iterations = collector.getIterations();
			expect(iterations).toHaveLength(2);
			expect(iterations[0].iteration).toBe(1);
			expect(iterations[0].hatId).toBe("tester");
			expect(iterations[1].iteration).toBe(2);
			expect(iterations[1].hatId).toBe("implementer");
		});

		it("should track start time", () => {
			const before = new Date();
			const collector = createReportCollector();
			const after = new Date();

			const startTime = collector.getStartTime();
			expect(startTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
			expect(startTime.getTime()).toBeLessThanOrEqual(after.getTime());
		});

		it("should count total iterations", () => {
			const collector = createReportCollector();
			expect(collector.getTotalIterations()).toBe(0);

			collector.recordIteration({
				startTime: new Date(),
				endTime: new Date(),
				durationMs: 100,
				exitCode: 0,
			});

			expect(collector.getTotalIterations()).toBe(1);
		});
	});
});
