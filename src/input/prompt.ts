import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "../core/logger.js";
import type { Issue } from "../core/types.js";

export interface PromptOptions {
	issue: Issue;
	completionPromise: string;
	scratchpadPath: string;
}

export function generatePrompt(
	options: PromptOptions,
	outputPath: string,
): void {
	const { issue, completionPromise, scratchpadPath } = options;

	const labels = issue.labels.length > 0 ? issue.labels.join(", ") : "(none)";

	const content = `# Task: ${issue.title}

## Labels
${labels}

## Description

${issue.body}

## Instructions

1. Analyze the task requirements
2. Plan the implementation approach
3. Implement the solution step by step
4. Verify with tests
5. When complete, output: ${completionPromise}

## Scratchpad

Use ${scratchpadPath} to track progress and share context between iterations.

---

**Important**: Output "${completionPromise}" when the task is fully complete.
`;

	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, content);

	logger.success(`Generated prompt: ${outputPath}`);
}
