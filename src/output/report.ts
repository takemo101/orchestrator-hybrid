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
	const parts = [
		formatSummarySection(data),
		formatTimelineSection(data.iterations),
		formatEventHistorySection(data.events),
		formatPRSection(data.prCreated),
		formatConfigSection(data.config),
		formatIssueSection(data.issue),
		`---\n\n*Generated at ${data.endTime.toISOString()}*\n`,
	];

	return parts.filter(Boolean).join("");
}

function formatSummarySection(data: ReportData): string {
	const duration = data.endTime.getTime() - data.startTime.getTime();
	const durationStr = formatDuration(duration);
	const statusEmoji = data.successful ? "✅" : "❌";
	const statusText = data.successful ? "Completed" : "Failed";

	return `# Orchestration Report

## Summary

| Metric | Value |
|--------|-------|
| Issue | #${data.issue.number}: ${data.issue.title} |
| Status | ${statusEmoji} ${statusText} |
| Reason | ${formatCompletionReason(data.completionReason)} |
| Duration | ${durationStr} |
| Iterations | ${data.totalIterations} |
| Backend | ${data.config.backend} |

`;
}

function formatTimelineSection(iterations: IterationRecord[]): string {
	let section = `## Timeline

| # | Hat | Duration | Exit | Event |
|---|-----|----------|------|-------|
`;

	for (const iter of iterations) {
		const hatDisplay = iter.hatName ?? iter.hatId ?? "-";
		const durationDisplay = `${iter.durationMs}ms`;
		const exitDisplay = iter.exitCode === 0 ? "✓" : `✗ (${iter.exitCode})`;
		const eventDisplay = iter.publishedEvent ?? "-";

		section += `| ${iter.iteration} | ${hatDisplay} | ${durationDisplay} | ${exitDisplay} | ${eventDisplay} |\n`;
	}

	return section;
}

function formatEventHistorySection(events: ReportData["events"]): string {
	if (events.length === 0) return "";

	let section = `
## Event History

\`\`\`
`;
	for (const event of events) {
		const time = event.timestamp.toISOString().slice(11, 19);
		const hatInfo = event.hatId ? ` (${event.hatId})` : "";
		section += `[${time}] ${event.type}${hatInfo}\n`;
	}
	section += `\`\`\`
`;
	return section;
}

function formatPRSection(prCreated: ReportData["prCreated"]): string {
	if (!prCreated) return "";

	return `
## Pull Request

- **URL**: ${prCreated.url}
- **Number**: #${prCreated.number}
- **Branch**: ${prCreated.branch}
`;
}

function formatConfigSection(config: ReportData["config"]): string {
	return `
## Configuration

\`\`\`yaml
backend: ${config.backend}
max_iterations: ${config.maxIterations}
completion_promise: ${config.completionPromise}
${config.preset ? `preset: ${config.preset}` : ""}
\`\`\`

`;
}

function formatIssueSection(issue: Issue): string {
	return `## Issue Details

### ${issue.title}

**Labels**: ${issue.labels.length > 0 ? issue.labels.join(", ") : "(none)"}

${issue.body}

`;
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

function formatCompletionReason(reason: ReportData["completionReason"]): string {
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
