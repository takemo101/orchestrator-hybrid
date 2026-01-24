import { exec } from "../core/exec.js";
import { logger } from "../core/logger.js";
import type { Issue } from "../core/types.js";

export async function fetchIssue(issueNumber: number): Promise<Issue> {
	logger.info(`Fetching issue #${issueNumber}...`);

	const { stdout } = await exec("gh", [
		"issue",
		"view",
		String(issueNumber),
		"--json",
		"title,body,labels,state",
	]);

	const data = JSON.parse(stdout);

	return {
		number: issueNumber,
		title: data.title,
		body: data.body ?? "",
		labels: data.labels?.map((l: { name: string }) => l.name) ?? [],
		state: data.state,
	};
}

export async function updateIssueLabel(issueNumber: number, label: string): Promise<void> {
	logger.info(`Adding label '${label}' to issue #${issueNumber}...`);

	try {
		await exec("gh", ["issue", "edit", String(issueNumber), "--add-label", label]);
	} catch {
		logger.warn(`Failed to add label '${label}' (may not exist)`);
	}
}

export async function addIssueComment(issueNumber: number, comment: string): Promise<void> {
	logger.info(`Adding comment to issue #${issueNumber}...`);

	try {
		await exec("gh", ["issue", "comment", String(issueNumber), "--body", comment]);
	} catch {
		logger.warn("Failed to add comment");
	}
}
