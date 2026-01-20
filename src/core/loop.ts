import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import chalk from "chalk";
import { type Backend, createBackend } from "../adapters/index.js";
import { requestApproval } from "../gates/approval.js";
import { fetchIssue, updateIssueLabel } from "../input/github.js";
import { generatePrompt } from "../input/prompt.js";
import { logger } from "./logger.js";
import { initScratchpad } from "./scratchpad.js";
import type { Config, Issue, LoopContext } from "./types.js";

export interface LoopOptions {
	issueNumber: number;
	config: Config;
	autoMode: boolean;
	maxIterations?: number;
}

export async function runLoop(options: LoopOptions): Promise<void> {
	const { issueNumber, config, autoMode, maxIterations } = options;

	const maxIter = maxIterations ?? config.loop.max_iterations;
	const completionPromise = config.loop.completion_promise;
	const scratchpadPath =
		config.state?.scratchpad_path ?? ".agent/scratchpad.md";
	const promptPath = ".agent/PROMPT.md";

	logger.info(`Starting orchestration loop for issue #${issueNumber}`);
	logger.info(`Max iterations: ${maxIter}`);
	logger.info(`Backend: ${config.backend.type}`);
	logger.info(`Completion promise: ${completionPromise}`);
	console.log("");

	const issue = await fetchIssue(issueNumber);

	generatePrompt({ issue, completionPromise, scratchpadPath }, promptPath);

	initScratchpad(scratchpadPath);

	await updateIssueLabel(issueNumber, "env:active");

	const preApproval = await requestApproval({
		gateName: "Pre-Loop",
		message:
			"About to start the orchestration loop. Review the generated prompt.",
		autoMode,
		scratchpadPath,
	});

	if (preApproval === "abort") {
		return;
	}

	const context: LoopContext = {
		issue,
		iteration: 0,
		maxIterations: maxIter,
		scratchpadPath,
		promptPath,
		completionPromise,
		autoMode,
	};

	const backend = createBackend(config.backend.type as "claude" | "opencode");

	await executeLoop(context, backend, issueNumber);
}

async function executeLoop(
	context: LoopContext,
	backend: Backend,
	issueNumber: number,
): Promise<void> {
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = 5;
	const historyPath = ".agent/output_history.txt";

	mkdirSync(dirname(historyPath), { recursive: true });

	while (context.iteration < context.maxIterations) {
		context.iteration++;

		printIterationHeader(context.iteration, context.maxIterations);

		const prompt = readFileSync(context.promptPath, "utf-8");

		logger.info(`Iteration ${context.iteration}: Executing ${backend.name}...`);

		const result = await backend.execute(prompt);

		logger.debug(`Output (truncated): ${result.output.slice(0, 500)}...`);

		if (result.exitCode !== 0) {
			consecutiveFailures++;
			logger.error(`Backend exited with code ${result.exitCode}`);

			if (consecutiveFailures >= maxConsecutiveFailures) {
				logger.error(
					`Too many consecutive failures (${consecutiveFailures}). Stopping.`,
				);
				await updateIssueLabel(issueNumber, "env:blocked");
				throw new Error("Max consecutive failures reached");
			}
			continue;
		}

		consecutiveFailures = 0;

		if (checkCompletion(result.output, context.completionPromise)) {
			console.log("");
			logger.success(`Task completed! (${context.completionPromise} detected)`);
			await updateIssueLabel(issueNumber, "env:pr-created");

			const postApproval = await requestApproval({
				gateName: "Post-Completion",
				message: "Task appears complete. Review before creating PR.",
				autoMode: context.autoMode,
				scratchpadPath: context.scratchpadPath,
			});

			if (postApproval === "abort") {
				return;
			}

			console.log("");
			logger.success(
				`Orchestration complete after ${context.iteration} iterations`,
			);
			return;
		}

		if (checkLoopDetection(result.output, historyPath)) {
			logger.warn(
				"Possible infinite loop detected. Requesting human intervention.",
			);

			const loopApproval = await requestApproval({
				gateName: "Loop Detection",
				message: "Output is similar to previous iterations. Continue?",
				autoMode: false,
				scratchpadPath: context.scratchpadPath,
			});

			if (loopApproval === "abort") {
				return;
			}
		}

		await sleep(1000);
	}

	logger.error(
		`Max iterations (${context.maxIterations}) reached without completion`,
	);
	await updateIssueLabel(issueNumber, "env:blocked");
	throw new Error("Max iterations reached");
}

function printIterationHeader(iteration: number, max: number): void {
	console.log("");
	console.log(
		chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	console.log(chalk.cyan(`  ITERATION ${iteration}/${max}`));
	console.log(
		chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	console.log("");
}

function checkCompletion(output: string, promise: string): boolean {
	return output.includes(promise);
}

function checkLoopDetection(output: string, historyPath: string): boolean {
	if (existsSync(historyPath)) {
		const history = readFileSync(historyPath, "utf-8");
		const lines = history.split("\n---OUTPUT---\n").filter(Boolean);
		const lastOutput = lines[lines.length - 1] ?? "";

		if (output === lastOutput) {
			logger.warn("Loop detected: output identical to previous iteration");
			return true;
		}
	}

	appendFileSync(historyPath, `${output}\n---OUTPUT---\n`);
	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
