import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import chalk from "chalk";
import { type Backend, createBackend } from "../adapters/index.js";
import { requestApproval } from "../gates/approval.js";
import { fetchIssue, updateIssueLabel } from "../input/github.js";
import { generatePrompt } from "../input/prompt.js";
import { checkForUncommittedChanges, createPR } from "../output/pr.js";
import {
	createReportCollector,
	generateReport,
	type ReportCollector,
	type ReportData,
} from "../output/report.js";
import { EventBus } from "./event.js";
import {
	buildHatPrompt,
	extractPublishedEvent,
	type HatDefinition,
	HatRegistry,
} from "./hat.js";
import { createTaskLogger, logger } from "./logger.js";
import { initScratchpad } from "./scratchpad.js";
import {
	type TaskManager,
	type TaskStateCallback,
	TaskStore,
} from "./task-manager.js";
import type { Config, Issue, LoopContext } from "./types.js";

export interface LoopOptions {
	issueNumber: number;
	config: Config;
	autoMode: boolean;
	maxIterations?: number;
	createPR?: boolean;
	draftPR?: boolean;
	useContainer?: boolean;
	generateReport?: boolean;
	reportPath?: string;
	preset?: string;
	taskId?: string;
	onStateChange?: TaskStateCallback;
	signal?: AbortSignal;
}

export interface MultiLoopOptions {
	issueNumbers: number[];
	config: Config;
	autoMode: boolean;
	maxIterations?: number;
	createPR?: boolean;
	draftPR?: boolean;
	useContainer?: boolean;
	generateReport?: boolean;
	preset?: string;
}

export async function runLoop(options: LoopOptions): Promise<void> {
	const {
		issueNumber,
		config,
		autoMode,
		maxIterations,
		createPR: shouldCreatePR = false,
		draftPR = false,
		useContainer = false,
		generateReport: shouldGenerateReport = false,
		reportPath = ".agent/report.md",
		preset,
		taskId,
		onStateChange,
		signal,
	} = options;

	const taskLogger = taskId ? createTaskLogger(taskId) : logger;

	const maxIter = maxIterations ?? config.loop.max_iterations;
	const completionPromise = config.loop.completion_promise;
	const scratchpadPath =
		config.state?.scratchpad_path ?? ".agent/scratchpad.md";
	const promptPath = taskId ? `.agent/${taskId}/PROMPT.md` : ".agent/PROMPT.md";
	const useHats = config.hats && Object.keys(config.hats).length > 0;

	const containerEnabled = useContainer || config.container?.enabled;

	taskLogger.info(`Starting orchestration loop for issue #${issueNumber}`);
	taskLogger.info(`Max iterations: ${maxIter}`);
	taskLogger.info(
		`Backend: ${containerEnabled ? "container" : config.backend.type}`,
	);
	taskLogger.info(`Completion promise: ${completionPromise}`);
	taskLogger.info(`Hat mode: ${useHats ? "enabled" : "disabled"}`);
	if (containerEnabled) {
		taskLogger.info("Container mode: enabled (isolated environment)");
	}

	const issue = await fetchIssue(issueNumber);

	onStateChange?.({ issueTitle: issue.title });

	const taskPromptDir = taskId ? `.agent/${taskId}` : ".agent";
	mkdirSync(taskPromptDir, { recursive: true });

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
		createPR: shouldCreatePR,
		draftPR,
		useContainer: containerEnabled ?? false,
		generateReport: shouldGenerateReport,
		reportPath,
		preset,
	};

	const backendType = containerEnabled
		? "container"
		: (config.backend.type as "claude" | "opencode");

	const backend = createBackend(backendType, {
		container: config.container
			? {
					image: config.container.image,
					envId: config.container.env_id,
				}
			: undefined,
	});

	const collector = shouldGenerateReport ? createReportCollector() : null;

	if (useHats && config.hats) {
		const hatRegistry = new HatRegistry();
		hatRegistry.registerFromConfig(config.hats);

		const eventBus = new EventBus();

		await executeHatLoop(
			context,
			backend,
			issueNumber,
			hatRegistry,
			eventBus,
			config,
			collector,
			taskId,
			onStateChange,
			signal,
		);
	} else {
		await executeSimpleLoop(
			context,
			backend,
			issueNumber,
			config,
			collector,
			taskId,
			onStateChange,
			signal,
		);
	}
}

export async function runMultipleLoops(
	options: MultiLoopOptions,
	taskManager: TaskManager,
): Promise<void> {
	const {
		issueNumbers,
		config,
		autoMode,
		maxIterations,
		createPR: shouldCreatePR = false,
		draftPR = false,
		useContainer = false,
		generateReport: shouldGenerateReport = false,
		preset,
	} = options;

	const issues: Issue[] = [];
	for (const issueNumber of issueNumbers) {
		const issue = await fetchIssue(issueNumber);
		issues.push(issue);
	}

	const maxIter = maxIterations ?? config.loop.max_iterations;

	const tasks = issues.map((issue) => ({
		issue,
		maxIterations: maxIter,
		runner: async (onStateChange: TaskStateCallback, signal: AbortSignal) => {
			const taskState = taskManager
				.getAllTasks()
				.find((t) => t.issueNumber === issue.number);
			const taskId = taskState?.id;

			await runLoop({
				issueNumber: issue.number,
				config,
				autoMode,
				maxIterations: maxIter,
				createPR: shouldCreatePR,
				draftPR,
				useContainer,
				generateReport: shouldGenerateReport,
				reportPath: taskId
					? `.agent/${taskId}/report.md`
					: `.agent/report-${issue.number}.md`,
				preset,
				taskId,
				onStateChange,
				signal,
			});
		},
	}));

	await taskManager.runParallel(tasks);
}

async function executeHatLoop(
	context: LoopContext,
	backend: Backend,
	issueNumber: number,
	hatRegistry: HatRegistry,
	eventBus: EventBus,
	config: Config,
	collector: ReportCollector | null,
	taskId?: string,
	onStateChange?: TaskStateCallback,
	signal?: AbortSignal,
): Promise<void> {
	const taskLogger = taskId ? createTaskLogger(taskId) : logger;
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = 5;
	const historyPath = taskId
		? `.agent/${taskId}/output_history.txt`
		: ".agent/output_history.txt";
	let completionReason: ReportData["completionReason"] = "max_iterations";
	let prResult: { url: string; number: number; branch: string } | undefined;

	mkdirSync(dirname(historyPath), { recursive: true });

	eventBus.emit("task.start", undefined, { issueNumber });

	let currentEvent = eventBus.getLastEvent();

	while (context.iteration < context.maxIterations) {
		if (signal?.aborted) {
			taskLogger.warn("Task cancelled");
			return;
		}

		context.iteration++;
		const iterStartTime = new Date();

		const activeHat = currentEvent
			? hatRegistry.findByTrigger(currentEvent.type)
			: hatRegistry.getAll()[0];

		if (!activeHat) {
			taskLogger.warn(
				`No hat found for event: ${currentEvent?.type ?? "none"}`,
			);
			break;
		}

		hatRegistry.setActive(activeHat.id);

		onStateChange?.({
			iteration: context.iteration,
			currentHat: activeHat.name ?? activeHat.id,
		});

		printIterationHeader(
			context.iteration,
			context.maxIterations,
			activeHat,
			taskId,
		);

		const basePrompt = readFileSync(context.promptPath, "utf-8");
		const prompt = buildHatPrompt(activeHat, basePrompt, {
			eventBus,
			currentEvent,
			iteration: context.iteration,
		});

		taskLogger.info(
			`Iteration ${context.iteration}: ${activeHat.name ?? activeHat.id} executing...`,
		);

		const result = await backend.execute(prompt);
		const iterEndTime = new Date();

		taskLogger.debug(`Output (truncated): ${result.output.slice(0, 500)}...`);

		const publishedEvent = extractPublishedEvent(result.output, activeHat);

		if (publishedEvent) {
			onStateChange?.({ lastEvent: publishedEvent });
		}

		collector?.recordIteration({
			hatId: activeHat.id,
			hatName: activeHat.name,
			startTime: iterStartTime,
			endTime: iterEndTime,
			durationMs: iterEndTime.getTime() - iterStartTime.getTime(),
			exitCode: result.exitCode,
			publishedEvent: publishedEvent ?? undefined,
		});

		if (result.exitCode !== 0) {
			consecutiveFailures++;
			taskLogger.error(`Backend exited with code ${result.exitCode}`);

			if (consecutiveFailures >= maxConsecutiveFailures) {
				taskLogger.error(
					`Too many consecutive failures (${consecutiveFailures}). Stopping.`,
				);
				await updateIssueLabel(issueNumber, "env:blocked");
				completionReason = "error";
				await finalizeReport(
					context,
					config,
					collector,
					eventBus,
					completionReason,
					prResult,
				);
				throw new Error("Max consecutive failures reached");
			}
			continue;
		}

		consecutiveFailures = 0;

		if (publishedEvent) {
			taskLogger.info(`Hat ${activeHat.id} published: ${publishedEvent}`);
			eventBus.emit(publishedEvent, activeHat.id);
			currentEvent = eventBus.getLastEvent();
		}

		if (
			checkCompletion(result.output, context.completionPromise) ||
			publishedEvent === context.completionPromise
		) {
			taskLogger.success(
				`Task completed! (${context.completionPromise} detected)`,
			);
			await updateIssueLabel(issueNumber, "env:pr-created");

			const postApproval = await requestApproval({
				gateName: "Post-Completion",
				message: "Task appears complete. Review before creating PR.",
				autoMode: context.autoMode,
				scratchpadPath: context.scratchpadPath,
			});

			if (postApproval === "abort") {
				completionReason = "aborted";
				await finalizeReport(
					context,
					config,
					collector,
					eventBus,
					completionReason,
					prResult,
				);
				return;
			}

			taskLogger.success(
				`Orchestration complete after ${context.iteration} iterations`,
			);
			printEventSummary(eventBus, taskId);

			if (context.createPR) {
				prResult = await handlePRCreation(context, taskId);
			}

			completionReason = "completed";
			await finalizeReport(
				context,
				config,
				collector,
				eventBus,
				completionReason,
				prResult,
			);
			return;
		}

		if (checkLoopDetection(result.output, historyPath, taskLogger)) {
			taskLogger.warn(
				"Possible infinite loop detected. Requesting human intervention.",
			);

			const loopApproval = await requestApproval({
				gateName: "Loop Detection",
				message: "Output is similar to previous iterations. Continue?",
				autoMode: false,
				scratchpadPath: context.scratchpadPath,
			});

			if (loopApproval === "abort") {
				completionReason = "aborted";
				await finalizeReport(
					context,
					config,
					collector,
					eventBus,
					completionReason,
					prResult,
				);
				return;
			}
		}

		await sleep(1000);
	}

	taskLogger.error(
		`Max iterations (${context.maxIterations}) reached without completion`,
	);
	await updateIssueLabel(issueNumber, "env:blocked");
	completionReason = "max_iterations";
	await finalizeReport(
		context,
		config,
		collector,
		eventBus,
		completionReason,
		prResult,
	);
	throw new Error("Max iterations reached");
}

async function executeSimpleLoop(
	context: LoopContext,
	backend: Backend,
	issueNumber: number,
	config: Config,
	collector: ReportCollector | null,
	taskId?: string,
	onStateChange?: TaskStateCallback,
	signal?: AbortSignal,
): Promise<void> {
	const taskLogger = taskId ? createTaskLogger(taskId) : logger;
	let consecutiveFailures = 0;
	const maxConsecutiveFailures = 5;
	const historyPath = taskId
		? `.agent/${taskId}/output_history.txt`
		: ".agent/output_history.txt";
	let completionReason: ReportData["completionReason"] = "max_iterations";
	let prResult: { url: string; number: number; branch: string } | undefined;

	mkdirSync(dirname(historyPath), { recursive: true });

	while (context.iteration < context.maxIterations) {
		if (signal?.aborted) {
			taskLogger.warn("Task cancelled");
			return;
		}

		context.iteration++;
		const iterStartTime = new Date();

		onStateChange?.({
			iteration: context.iteration,
		});

		printIterationHeader(
			context.iteration,
			context.maxIterations,
			undefined,
			taskId,
		);

		const prompt = readFileSync(context.promptPath, "utf-8");

		taskLogger.info(
			`Iteration ${context.iteration}: Executing ${backend.name}...`,
		);

		const result = await backend.execute(prompt);
		const iterEndTime = new Date();

		taskLogger.debug(`Output (truncated): ${result.output.slice(0, 500)}...`);

		collector?.recordIteration({
			startTime: iterStartTime,
			endTime: iterEndTime,
			durationMs: iterEndTime.getTime() - iterStartTime.getTime(),
			exitCode: result.exitCode,
		});

		if (result.exitCode !== 0) {
			consecutiveFailures++;
			taskLogger.error(`Backend exited with code ${result.exitCode}`);

			if (consecutiveFailures >= maxConsecutiveFailures) {
				taskLogger.error(
					`Too many consecutive failures (${consecutiveFailures}). Stopping.`,
				);
				await updateIssueLabel(issueNumber, "env:blocked");
				completionReason = "error";
				await finalizeReport(
					context,
					config,
					collector,
					null,
					completionReason,
					prResult,
				);
				throw new Error("Max consecutive failures reached");
			}
			continue;
		}

		consecutiveFailures = 0;

		if (checkCompletion(result.output, context.completionPromise)) {
			taskLogger.success(
				`Task completed! (${context.completionPromise} detected)`,
			);
			await updateIssueLabel(issueNumber, "env:pr-created");

			const postApproval = await requestApproval({
				gateName: "Post-Completion",
				message: "Task appears complete. Review before creating PR.",
				autoMode: context.autoMode,
				scratchpadPath: context.scratchpadPath,
			});

			if (postApproval === "abort") {
				completionReason = "aborted";
				await finalizeReport(
					context,
					config,
					collector,
					null,
					completionReason,
					prResult,
				);
				return;
			}

			taskLogger.success(
				`Orchestration complete after ${context.iteration} iterations`,
			);

			if (context.createPR) {
				prResult = await handlePRCreation(context, taskId);
			}

			completionReason = "completed";
			await finalizeReport(
				context,
				config,
				collector,
				null,
				completionReason,
				prResult,
			);
			return;
		}

		if (checkLoopDetection(result.output, historyPath, taskLogger)) {
			taskLogger.warn(
				"Possible infinite loop detected. Requesting human intervention.",
			);

			const loopApproval = await requestApproval({
				gateName: "Loop Detection",
				message: "Output is similar to previous iterations. Continue?",
				autoMode: false,
				scratchpadPath: context.scratchpadPath,
			});

			if (loopApproval === "abort") {
				completionReason = "aborted";
				await finalizeReport(
					context,
					config,
					collector,
					null,
					completionReason,
					prResult,
				);
				return;
			}
		}

		await sleep(1000);
	}

	taskLogger.error(
		`Max iterations (${context.maxIterations}) reached without completion`,
	);
	await updateIssueLabel(issueNumber, "env:blocked");
	completionReason = "max_iterations";
	await finalizeReport(
		context,
		config,
		collector,
		null,
		completionReason,
		prResult,
	);
	throw new Error("Max iterations reached");
}

function printIterationHeader(
	iteration: number,
	max: number,
	hat?: HatDefinition,
	taskId?: string,
): void {
	const taskPrefix = taskId ? `[${taskId}] ` : "";
	console.log("");
	console.log(
		chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	if (hat) {
		console.log(
			chalk.cyan(
				`  ${taskPrefix}ITERATION ${iteration}/${max} │ ${hat.name ?? hat.id}`,
			),
		);
	} else {
		console.log(chalk.cyan(`  ${taskPrefix}ITERATION ${iteration}/${max}`));
	}
	console.log(
		chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	console.log("");
}

function printEventSummary(eventBus: EventBus, taskId?: string): void {
	const events = eventBus.getHistory();
	if (events.length === 0) return;

	const taskPrefix = taskId ? `[${taskId}] ` : "";
	console.log("");
	console.log(chalk.gray(`${taskPrefix}Event History:`));
	for (const event of events) {
		const hatInfo = event.hatId ? ` (${event.hatId})` : "";
		console.log(chalk.gray(`  → ${event.type}${hatInfo}`));
	}
}

function checkCompletion(output: string, promise: string): boolean {
	return output.includes(promise);
}

function checkLoopDetection(
	output: string,
	historyPath: string,
	taskLogger: typeof logger,
): boolean {
	if (existsSync(historyPath)) {
		const history = readFileSync(historyPath, "utf-8");
		const lines = history.split("\n---OUTPUT---\n").filter(Boolean);
		const lastOutput = lines[lines.length - 1] ?? "";

		if (output === lastOutput) {
			taskLogger.warn("Loop detected: output identical to previous iteration");
			return true;
		}
	}

	appendFileSync(historyPath, `${output}\n---OUTPUT---\n`);
	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handlePRCreation(
	context: LoopContext,
	taskId?: string,
): Promise<{ url: string; number: number; branch: string } | undefined> {
	const taskLogger = taskId ? createTaskLogger(taskId) : logger;
	const hasChanges = await checkForUncommittedChanges();

	if (!hasChanges) {
		taskLogger.warn("No uncommitted changes found. Skipping PR creation.");
		return undefined;
	}

	const taskPrefix = taskId ? `[${taskId}] ` : "";
	console.log("");
	console.log(
		chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	console.log(chalk.green(`  ${taskPrefix}CREATING PULL REQUEST`));
	console.log(
		chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"),
	);
	console.log("");

	try {
		const result = await createPR({
			issue: context.issue,
			scratchpadPath: context.scratchpadPath,
			draft: context.draftPR,
		});

		console.log("");
		taskLogger.success(`PR created: ${result.url}`);
		console.log(chalk.gray(`  Branch: ${result.branch}`));
		console.log(chalk.gray(`  PR #${result.number}`));

		return result;
	} catch (error) {
		taskLogger.error(
			`Failed to create PR: ${error instanceof Error ? error.message : String(error)}`,
		);
		return undefined;
	}
}

async function finalizeReport(
	context: LoopContext,
	config: Config,
	collector: ReportCollector | null,
	eventBus: EventBus | null,
	completionReason: ReportData["completionReason"],
	prResult?: { url: string; number: number; branch: string },
): Promise<void> {
	if (!context.generateReport || !collector) {
		return;
	}

	const reportData: ReportData = {
		issue: context.issue,
		startTime: collector.getStartTime(),
		endTime: new Date(),
		totalIterations: collector.getTotalIterations(),
		successful: completionReason === "completed",
		completionReason,
		iterations: collector.getIterations(),
		events: eventBus?.getHistory() ?? [],
		config: {
			backend: config.backend.type,
			maxIterations: context.maxIterations,
			completionPromise: context.completionPromise,
			useContainer: context.useContainer,
			preset: context.preset,
		},
		prCreated: prResult,
	};

	generateReport(reportData, context.reportPath);
}
