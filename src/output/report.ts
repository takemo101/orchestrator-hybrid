import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { OrchEvent } from "../core/event.js";
import { logger } from "../core/logger.js";
import type { Issue } from "../core/types.js";

export interface IterationRecord {
	iteration: number;
	hatId?: string;
	hatName?: string;
	startTime: Date;
	endTime: Date;
	durationMs: number;
	exitCode: number;
	publishedEvent?: string;
}

export interface ReportData {
	issue: Issue;
	startTime: Date;
	endTime: Date;
	totalIterations: number;
	successful: boolean;
	completionReason: "completed" | "max_iterations" | "aborted" | "error";
	iterations: IterationRecord[];
	events: OrchEvent[];
	config: {
		backend: string;
		maxIterations: number;
		completionPromise: string;
		useContainer: boolean;
		preset?: string;
	};
	prCreated?: {
		url: string;
		number: number;
		branch: string;
	};
}

export function generateReport(data: ReportData, outputPath: string): void {
	const markdown = formatMarkdownReport(data);
	const json = JSON.stringify(data, null, 2);

	mkdirSync(dirname(outputPath), { recursive: true });

	writeFileSync(outputPath, markdown);
	writeFileSync(outputPath.replace(".md", ".json"), json);

	logger.success(`Report generated: ${outputPath}`);
}

function formatMarkdownReport(data: ReportData): string {
	const duration = data.endTime.getTime() - data.startTime.getTime();
	const durationStr = formatDuration(duration);

	const statusEmoji = data.successful ? "✅" : "❌";
	const statusText = data.successful ? "Completed" : "Failed";

	let report = `# Orchestration Report

## Summary

| Metric | Value |
|--------|-------|
| Issue | #${data.issue.number}: ${data.issue.title} |
| Status | ${statusEmoji} ${statusText} |
| Reason | ${formatCompletionReason(data.completionReason)} |
| Duration | ${durationStr} |
| Iterations | ${data.totalIterations} |
| Backend | ${data.config.backend} |
| Container | ${data.config.useContainer ? "Yes" : "No"} |

## Timeline

| # | Hat | Duration | Exit | Event |
|---|-----|----------|------|-------|
`;

	for (const iter of data.iterations) {
		const hatDisplay = iter.hatName ?? iter.hatId ?? "-";
		const durationDisplay = `${iter.durationMs}ms`;
		const exitDisplay = iter.exitCode === 0 ? "✓" : `✗ (${iter.exitCode})`;
		const eventDisplay = iter.publishedEvent ?? "-";

		report += `| ${iter.iteration} | ${hatDisplay} | ${durationDisplay} | ${exitDisplay} | ${eventDisplay} |\n`;
	}

	if (data.events.length > 0) {
		report += `
## Event History

\`\`\`
`;
		for (const event of data.events) {
			const time = event.timestamp.toISOString().slice(11, 19);
			const hatInfo = event.hatId ? ` (${event.hatId})` : "";
			report += `[${time}] ${event.type}${hatInfo}\n`;
		}
		report += `\`\`\`
`;
	}

	if (data.prCreated) {
		report += `
## Pull Request

- **URL**: ${data.prCreated.url}
- **Number**: #${data.prCreated.number}
- **Branch**: ${data.prCreated.branch}
`;
	}

	report += `
## Configuration

\`\`\`yaml
backend: ${data.config.backend}
max_iterations: ${data.config.maxIterations}
completion_promise: ${data.config.completionPromise}
use_container: ${data.config.useContainer}
${data.config.preset ? `preset: ${data.config.preset}` : ""}
\`\`\`

## Issue Details

### ${data.issue.title}

**Labels**: ${data.issue.labels.length > 0 ? data.issue.labels.join(", ") : "(none)"}

${data.issue.body}

---

*Generated at ${data.endTime.toISOString()}*
`;

	return report;
}

function formatDuration(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}

	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;

	if (minutes < 60) {
		return `${minutes}m ${remainingSeconds}s`;
	}

	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;

	return `${hours}h ${remainingMinutes}m`;
}

function formatCompletionReason(
	reason: ReportData["completionReason"],
): string {
	switch (reason) {
		case "completed":
			return "Task completed successfully";
		case "max_iterations":
			return "Maximum iterations reached";
		case "aborted":
			return "Aborted by user";
		case "error":
			return "Error occurred";
		default:
			return reason;
	}
}

export function createReportCollector(): ReportCollector {
	return new ReportCollector();
}

export class ReportCollector {
	private iterations: IterationRecord[] = [];
	private startTime: Date = new Date();

	recordIteration(record: Omit<IterationRecord, "iteration">): void {
		this.iterations.push({
			...record,
			iteration: this.iterations.length + 1,
		});
	}

	getIterations(): IterationRecord[] {
		return [...this.iterations];
	}

	getStartTime(): Date {
		return this.startTime;
	}

	getTotalIterations(): number {
		return this.iterations.length;
	}
}
