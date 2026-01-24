import { exec } from "../core/exec.js";
import { logger } from "../core/logger.js";
import { readScratchpad } from "../core/scratchpad.js";
import type { Issue } from "../core/types.js";

export interface CreatePROptions {
	issue: Issue;
	baseBranch?: string;
	scratchpadPath: string;
	draft?: boolean;
}

export interface PRResult {
	url: string;
	number: number;
	branch: string;
}

export async function createPR(options: CreatePROptions): Promise<PRResult> {
	const { issue, baseBranch = "main", scratchpadPath, draft = false } = options;

	const branchName = generateBranchName(issue);

	await ensureBranchExists(branchName);

	await commitChanges(issue);

	await pushBranch(branchName);

	const prBody = generatePRBody(issue, scratchpadPath);

	const prUrl = await createGitHubPR({
		title: `${issue.title} (closes #${issue.number})`,
		body: prBody,
		baseBranch,
		headBranch: branchName,
		draft,
	});

	const prNumber = extractPRNumber(prUrl);

	logger.success(`Created PR: ${prUrl}`);

	return {
		url: prUrl,
		number: prNumber,
		branch: branchName,
	};
}

function generateBranchName(issue: Issue): string {
	const sanitized = issue.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 50);

	return `issue-${issue.number}-${sanitized}`;
}

async function ensureBranchExists(branchName: string): Promise<void> {
	const { stdout: currentBranch } = await exec("git", ["branch", "--show-current"]);

	if (currentBranch.trim() === branchName) {
		return;
	}

	try {
		await exec("git", ["checkout", "-b", branchName]);
		logger.info(`Created branch: ${branchName}`);
	} catch {
		await exec("git", ["checkout", branchName]);
		logger.info(`Switched to branch: ${branchName}`);
	}
}

async function commitChanges(issue: Issue): Promise<void> {
	const { stdout: status } = await exec("git", ["status", "--porcelain"]);

	if (!status.trim()) {
		logger.info("No changes to commit");
		return;
	}

	await exec("git", ["add", "-A"]);

	const commitMessage = `feat: ${issue.title}

Implements #${issue.number}

Co-authored-by: orchestrator-hybrid <orchestrator@local>`;

	await exec("git", ["commit", "-m", commitMessage]);

	logger.info("Committed changes");
}

async function pushBranch(branchName: string): Promise<void> {
	try {
		await exec("git", ["push", "-u", "origin", branchName]);
		logger.info(`Pushed branch: ${branchName}`);
	} catch {
		await exec("git", ["push", "--force-with-lease", "-u", "origin", branchName]);
		logger.info(`Force pushed branch: ${branchName}`);
	}
}

function generatePRBody(issue: Issue, scratchpadPath: string): string {
	const scratchpad = readScratchpad(scratchpadPath);

	return `## Summary

Closes #${issue.number}

## Changes

${extractChangesFromScratchpad(scratchpad)}

## Original Issue

> ${issue.title}

${issue.body.slice(0, 500)}${issue.body.length > 500 ? "..." : ""}

---

*This PR was automatically created by [orchestrator-hybrid](https://github.com/takemo101/orchestrator-hybrid)*
`;
}

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

interface CreateGitHubPROptions {
	title: string;
	body: string;
	baseBranch: string;
	headBranch: string;
	draft: boolean;
}

async function createGitHubPR(options: CreateGitHubPROptions): Promise<string> {
	const { title, body, baseBranch, headBranch, draft } = options;

	const args = [
		"pr",
		"create",
		"--title",
		title,
		"--body",
		body,
		"--base",
		baseBranch,
		"--head",
		headBranch,
	];

	if (draft) {
		args.push("--draft");
	}

	const { stdout } = await exec("gh", args);

	return stdout.trim();
}

function extractPRNumber(url: string): number {
	const match = url.match(/\/pull\/(\d+)/);
	return match ? Number.parseInt(match[1], 10) : 0;
}

export async function checkForUncommittedChanges(): Promise<boolean> {
	const { stdout } = await exec("git", ["status", "--porcelain"]);
	return stdout.trim().length > 0;
}

export async function getCurrentBranch(): Promise<string> {
	const { stdout } = await exec("git", ["branch", "--show-current"]);
	return stdout.trim();
}
