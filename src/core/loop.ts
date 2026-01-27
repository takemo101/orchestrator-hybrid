import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import chalk from "chalk";
import { type Backend, createBackend } from "../adapters/index.js";
import { requestApproval } from "../gates/approval.js";
import { fetchIssue, updateIssueLabel } from "../input/github.js";
import { generatePrompt } from "../input/prompt.js";
import { IssueGenerator } from "../output/issue-generator.js";
import { checkForUncommittedChanges, createPR } from "../output/pr.js";
import { PRAutoMerger } from "../output/pr-auto-merger.js";
import {
	createReportCollector,
	generateReport,
	type ReportCollector,
	type ReportData,
} from "../output/report.js";
import { extractImprovements } from "../utils/improvement-extractor.js";
import {
	type EnvironmentInfo,
	HybridEnvironmentBuilder,
} from "../worktree/hybrid-environment-builder.js";
import { WorktreeManager } from "../worktree/worktree-manager.js";
import { EventBus } from "./event.js";
import { buildHatPrompt, extractPublishedEvent, type HatDefinition, HatRegistry } from "./hat.js";
import { LogWriter } from "./log-writer.js";
import { createTaskLogger, logger } from "./logger.js";
import { initScratchpad } from "./scratchpad.js";
import { SessionRecorder } from "./session-recorder.js";
import type { TaskManager, TaskStateCallback } from "./task-manager.js";
import type {
	Config,
	Issue,
	LoopContext,
	PRConfig,
	SandboxConfig,
	WorktreeConfig,
} from "./types.js";

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
	prConfig?: PRConfig;
	resolveDeps?: boolean;
	ignoreDeps?: boolean;
	recordSessionPath?: string;
	onStateChange?: TaskStateCallback;
	signal?: AbortSignal;
	/** worktree設定（v2.0.0） */
	worktreeConfig?: WorktreeConfig;
	/** sandbox設定（v2.0.0） */
	sandboxConfig?: SandboxConfig;
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
	prConfig?: PRConfig;
	resolveDeps?: boolean;
	ignoreDeps?: boolean;
	worktreeConfig?: WorktreeConfig;
	sandboxConfig?: SandboxConfig;
}

export async function runLoop(options: LoopOptions): Promise<void> {
	const { issueNumber, config, autoMode, taskId, onStateChange, signal, recordSessionPath } =
		options;

	const taskLogger = taskId ? createTaskLogger(taskId) : logger;
	const loopConfig = buildLoopConfig(options, config);

	logLoopStart(taskLogger, issueNumber, loopConfig);

	const issue = await fetchIssue(issueNumber);
	onStateChange?.({ issueTitle: issue.title });

	const environmentInfo = await buildHybridEnvironment(options, issueNumber, taskLogger);

	await initializeLoopEnvironment(issue, loopConfig, taskId);

	const preApproval = await requestApproval({
		gateName: "Pre-Loop",
		message: "About to start the orchestration loop. Review the generated prompt.",
		autoMode,
		scratchpadPath: loopConfig.scratchpadPath,
	});

	if (preApproval === "abort") {
		if (environmentInfo) {
			await cleanupHybridEnvironment(options, issueNumber, taskLogger);
		}
		return;
	}

	const context = buildLoopContext(issue, loopConfig, options);
	const backend = createLoopBackend(
		config,
		loopConfig.containerEnabled,
		environmentInfo?.workingDirectory,
	);
	const collector = loopConfig.shouldGenerateReport ? createReportCollector() : null;

	const logWriter = new LogWriter({
		taskId: taskId ?? `issue-${issueNumber}`,
		baseDir: ".agent",
	});
	await logWriter.initialize();
	taskLogger.debug(`Log directory: ${logWriter.getLogDir()}`);

	let sessionRecorder: SessionRecorder | undefined;
	if (recordSessionPath) {
		sessionRecorder = new SessionRecorder(recordSessionPath);
		await sessionRecorder.startRecording();
	}

	try {
		await executeLoop(
			context,
			backend,
			issueNumber,
			config,
			collector,
			logWriter,
			sessionRecorder,
			taskId,
			onStateChange,
			signal,
		);
	} finally {
		if (sessionRecorder) {
			await sessionRecorder.stopRecording();
		}
		if (environmentInfo && options.worktreeConfig?.auto_cleanup) {
			await cleanupHybridEnvironment(options, issueNumber, taskLogger);
		}
	}
}

interface LoopConfig {
	maxIter: number;
	completionPromise: string;
	scratchpadPath: string;
	promptPath: string;
	useHats: boolean;
	containerEnabled: boolean;
	shouldGenerateReport: boolean;
	reportPath: string;
}

function buildLoopConfig(options: LoopOptions, config: Config): LoopConfig {
	const containerEnabled = options.useContainer || config.container?.enabled || false;
	return {
		maxIter: options.maxIterations ?? config.loop.max_iterations,
		completionPromise: config.loop.completion_promise,
		scratchpadPath: config.state?.scratchpad_path ?? ".agent/scratchpad.md",
		promptPath: options.taskId ? `.agent/${options.taskId}/PROMPT.md` : ".agent/PROMPT.md",
		useHats: !!(config.hats && Object.keys(config.hats).length > 0),
		containerEnabled,
		shouldGenerateReport: options.generateReport ?? false,
		reportPath: options.reportPath ?? ".agent/report.md",
	};
}

function logLoopStart(taskLogger: typeof logger, issueNumber: number, config: LoopConfig): void {
	taskLogger.info(`Starting orchestration loop for issue #${issueNumber}`);
	taskLogger.info(`Max iterations: ${config.maxIter}`);
	taskLogger.info(`Backend: ${config.containerEnabled ? "container" : "claude"}`);
	taskLogger.info(`Completion promise: ${config.completionPromise}`);
	taskLogger.info(`Hat mode: ${config.useHats ? "enabled" : "disabled"}`);
	if (config.containerEnabled) {
		taskLogger.info("Container mode: enabled (isolated environment)");
	}
}

async function initializeLoopEnvironment(
	issue: Issue,
	config: LoopConfig,
	taskId?: string,
): Promise<void> {
	const taskPromptDir = taskId ? `.agent/${taskId}` : ".agent";
	mkdirSync(taskPromptDir, { recursive: true });
	generatePrompt(
		{ issue, completionPromise: config.completionPromise, scratchpadPath: config.scratchpadPath },
		config.promptPath,
	);
	initScratchpad(config.scratchpadPath);
	await updateIssueLabel(issue.number, "env:active");
}

function buildLoopContext(issue: Issue, config: LoopConfig, options: LoopOptions): LoopContext {
	const taskId = options.taskId;
	const logDir = taskId ? join(".agent", taskId) : ".agent";

	return {
		issue,
		iteration: 0,
		maxIterations: config.maxIter,
		scratchpadPath: config.scratchpadPath,
		promptPath: config.promptPath,
		completionPromise: config.completionPromise,
		autoMode: options.autoMode,
		createPR: options.createPR ?? false,
		draftPR: options.draftPR ?? false,
		useContainer: config.containerEnabled,
		generateReport: config.shouldGenerateReport,
		reportPath: config.reportPath,
		preset: options.preset,
		taskId,
		logDir,
		prConfig: options.prConfig,
	};
}

function createLoopBackend(config: Config, containerEnabled: boolean, workdir?: string): Backend {
	const backendType = containerEnabled
		? "container"
		: (config.backend.type as "claude" | "opencode");
	return createBackend(backendType, {
		container: config.container
			? { image: config.container.image, envId: config.container.env_id }
			: undefined,
		workdir,
	});
}

async function executeLoop(
	context: LoopContext,
	backend: Backend,
	issueNumber: number,
	config: Config,
	collector: ReportCollector | null,
	logWriter: LogWriter,
	sessionRecorder?: SessionRecorder,
	taskId?: string,
	onStateChange?: TaskStateCallback,
	signal?: AbortSignal,
): Promise<void> {
	const useHats = config.hats && Object.keys(config.hats).length > 0;

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
			logWriter,
			sessionRecorder,
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
			logWriter,
			sessionRecorder,
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
		prConfig,
		worktreeConfig,
		sandboxConfig,
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
			const taskState = taskManager.getAllTasks().find((t) => t.issueNumber === issue.number);
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
				reportPath: taskId ? `.agent/${taskId}/report.md` : `.agent/report-${issue.number}.md`,
				preset,
				taskId,
				prConfig,
				worktreeConfig,
				sandboxConfig,
				onStateChange,
				signal,
			});
		},
	}));

	await taskManager.runParallel(tasks);
}

interface LoopState {
	consecutiveFailures: number;
	completionReason: ReportData["completionReason"];
	prResult?: { url: string; number: number; branch: string };
	merged?: boolean;
}

interface HatIterationParams {
	context: LoopContext;
	backend: Backend;
	hatRegistry: HatRegistry;
	eventBus: EventBus;
	collector: ReportCollector | null;
	logWriter: LogWriter;
	sessionRecorder?: SessionRecorder;
	taskLogger: typeof logger;
	taskId?: string;
	onStateChange?: TaskStateCallback;
}

async function executeHatLoop(
	context: LoopContext,
	backend: Backend,
	issueNumber: number,
	hatRegistry: HatRegistry,
	eventBus: EventBus,
	config: Config,
	collector: ReportCollector | null,
	logWriter: LogWriter,
	sessionRecorder?: SessionRecorder,
	taskId?: string,
	onStateChange?: TaskStateCallback,
	signal?: AbortSignal,
): Promise<void> {
	const taskLogger = taskId ? createTaskLogger(taskId) : logger;
	const historyPath = taskId ? `.agent/${taskId}/output_history.txt` : ".agent/output_history.txt";
	const state: LoopState = { consecutiveFailures: 0, completionReason: "max_iterations" };

	mkdirSync(dirname(historyPath), { recursive: true });
	eventBus.emit("task.start", undefined, { issueNumber });

	const params: HatIterationParams = {
		context,
		backend,
		hatRegistry,
		eventBus,
		collector,
		logWriter,
		sessionRecorder,
		taskLogger,
		taskId,
		onStateChange,
	};

	const loopResult = await runHatLoopIterations(params, state, signal);

	if (loopResult.completed) {
		await handleLoopEnd(context, config, collector, eventBus, state, issueNumber, taskId);
		if (loopResult.error) throw loopResult.error;
		return;
	}

	taskLogger.error(`Max iterations (${context.maxIterations}) reached without completion`);
	await updateIssueLabel(issueNumber, "env:blocked");
	await finalizeReport(
		context,
		config,
		collector,
		eventBus,
		state.completionReason,
		state.prResult,
	);
	throw new Error("Max iterations reached");
}

interface HatLoopResult {
	completed: boolean;
	error?: Error;
}

async function runHatLoopIterations(
	params: HatIterationParams,
	state: LoopState,
	signal?: AbortSignal,
): Promise<HatLoopResult> {
	const { context, eventBus, taskLogger } = params;
	let currentEvent = eventBus.getLastEvent();

	while (context.iteration < context.maxIterations) {
		if (signal?.aborted) {
			taskLogger.warn("Task cancelled");
			return { completed: true };
		}

		const iterResult = await executeHatIteration(params, currentEvent, state);

		if (iterResult.shouldStop) {
			return { completed: true, error: iterResult.error };
		}

		if (iterResult.newEvent) {
			currentEvent = iterResult.newEvent;
		}

		if (iterResult.loopDetected) {
			const shouldAbort = await handleLoopDetection(context, taskLogger);
			if (shouldAbort) {
				state.completionReason = "aborted";
				return { completed: true };
			}
		}

		await sleep(1000);
	}

	return { completed: false };
}

interface IterationResult {
	shouldStop: boolean;
	error?: Error;
	newEvent?: ReturnType<EventBus["getLastEvent"]>;
	loopDetected?: boolean;
}

async function executeHatIteration(
	params: HatIterationParams,
	currentEvent: ReturnType<EventBus["getLastEvent"]>,
	state: LoopState,
): Promise<IterationResult> {
	const {
		context,
		backend,
		hatRegistry,
		eventBus,
		collector,
		logWriter,
		sessionRecorder,
		taskLogger,
		taskId,
		onStateChange,
	} = params;
	const historyPath = taskId ? `.agent/${taskId}/output_history.txt` : ".agent/output_history.txt";

	context.iteration++;
	const iterStartTime = new Date();

	const activeHat = currentEvent
		? hatRegistry.findByTrigger(currentEvent.type)
		: hatRegistry.getAll()[0];

	if (!activeHat) {
		taskLogger.warn(`No hat found for event: ${currentEvent?.type ?? "none"}`);
		return { shouldStop: true };
	}

	hatRegistry.setActive(activeHat.id);
	onStateChange?.({ iteration: context.iteration, currentHat: activeHat.name ?? activeHat.id });
	printIterationHeader(context.iteration, context.maxIterations, activeHat, taskId);

	const prompt = buildHatPrompt(activeHat, readFileSync(context.promptPath, "utf-8"), {
		eventBus,
		currentEvent,
		iteration: context.iteration,
	});

	taskLogger.info(`Iteration ${context.iteration}: ${activeHat.name ?? activeHat.id} executing...`);

	const result = await backend.execute(prompt);
	const iterEndTime = new Date();

	const iterationHeader = `\n--- Iteration ${context.iteration} (${activeHat.name ?? activeHat.id}) ---\n`;
	await logWriter.writeOutput(iterationHeader);
	await logWriter.writeStdout(result.output);

	taskLogger.debug(`Output (truncated): ${result.output.slice(0, 500)}...`);

	const publishedEvent = extractPublishedEvent(result.output, activeHat);
	if (publishedEvent) onStateChange?.({ lastEvent: publishedEvent });

	collector?.recordIteration({
		hatId: activeHat.id,
		hatName: activeHat.name,
		startTime: iterStartTime,
		endTime: iterEndTime,
		durationMs: iterEndTime.getTime() - iterStartTime.getTime(),
		exitCode: result.exitCode,
		publishedEvent: publishedEvent ?? undefined,
	});

	const isComplete =
		checkCompletion(result.output, context.completionPromise) ||
		publishedEvent === context.completionPromise;

	const events: string[] = publishedEvent ? [publishedEvent] : [];
	if (isComplete && !events.includes(context.completionPromise)) {
		events.push(context.completionPromise);
	}

	if (sessionRecorder) {
		await sessionRecorder.recordIteration(
			context.iteration,
			activeHat.name ?? activeHat.id,
			prompt,
			result.output,
			events,
		);
	}

	if (result.exitCode !== 0) {
		return handleIterationFailure(state, taskLogger);
	}

	state.consecutiveFailures = 0;

	if (publishedEvent) {
		taskLogger.info(`Hat ${activeHat.id} published: ${publishedEvent}`);
		eventBus.emit(publishedEvent, activeHat.id);
	}

	if (isComplete) {
		state.completionReason = "completed";
		return { shouldStop: true };
	}

	const loopDetected = checkLoopDetection(result.output, historyPath, taskLogger);
	return { shouldStop: false, newEvent: eventBus.getLastEvent(), loopDetected };
}

function handleIterationFailure(state: LoopState, taskLogger: typeof logger): IterationResult {
	state.consecutiveFailures++;
	taskLogger.error(`Backend exited with non-zero code`);

	if (state.consecutiveFailures >= 5) {
		taskLogger.error(`Too many consecutive failures. Stopping.`);
		state.completionReason = "error";
		return { shouldStop: true, error: new Error("Max consecutive failures reached") };
	}

	return { shouldStop: false };
}

async function handleLoopEnd(
	context: LoopContext,
	config: Config,
	collector: ReportCollector | null,
	eventBus: EventBus | null,
	state: LoopState,
	issueNumber: number,
	taskId?: string,
): Promise<void> {
	const taskLogger = taskId ? createTaskLogger(taskId) : logger;

	if (state.completionReason === "completed") {
		taskLogger.success(`Task completed! (${context.completionPromise} detected)`);
		await updateIssueLabel(issueNumber, "env:pr-created");

		const postApproval = await requestApproval({
			gateName: "Post-Completion",
			message: "Task appears complete. Review before creating PR.",
			autoMode: context.autoMode,
			scratchpadPath: context.scratchpadPath,
		});

		if (postApproval === "abort") {
			state.completionReason = "aborted";
		} else {
			taskLogger.success(`Orchestration complete after ${context.iteration} iterations`);
			if (eventBus) printEventSummary(eventBus, taskId);
			if (context.createPR) {
				state.prResult = await handlePRCreation(context, taskId);

				// PR自動マージ（prConfigが有効な場合）
				if (state.prResult && context.prConfig?.auto_merge) {
					state.merged = await handlePRAutoMerge(
						state.prResult.number,
						context.prConfig,
						issueNumber,
						taskLogger,
					);
				}
			}

			// IssueGenerator で改善Issueを作成（設定有効時）
			await handleIssueGeneration(context, config, taskLogger);
		}
	} else if (state.completionReason === "error") {
		await updateIssueLabel(issueNumber, "env:blocked");
	}

	await finalizeReport(
		context,
		config,
		collector,
		eventBus,
		state.completionReason,
		state.prResult,
	);
}

/**
 * PR自動マージを実行
 *
 * @param prNumber PR番号
 * @param prConfig PR設定
 * @param issueNumber Issue番号
 * @param taskLogger タスクロガー
 * @returns マージ成功時はtrue
 */
async function handlePRAutoMerge(
	prNumber: number,
	prConfig: PRConfig,
	issueNumber: number,
	taskLogger: typeof logger,
): Promise<boolean> {
	const merger = new PRAutoMerger({
		enabled: true,
		merge_method: prConfig.merge_method,
		delete_branch: prConfig.delete_branch,
		ci_timeout_secs: prConfig.ci_timeout_secs,
	});

	try {
		const merged = await merger.autoMerge(prNumber);
		if (merged) {
			await updateIssueLabel(issueNumber, "env:merged");
		}
		return merged;
	} catch (error) {
		// CI失敗時はエラーログのみ、タスク自体は成功扱い
		taskLogger.error(`PR自動マージ失敗: ${error instanceof Error ? error.message : String(error)}`);
		return false;
	}
}

async function handleLoopDetection(
	context: LoopContext,
	taskLogger: typeof logger,
): Promise<boolean> {
	taskLogger.warn("Possible infinite loop detected. Requesting human intervention.");

	const loopApproval = await requestApproval({
		gateName: "Loop Detection",
		message: "Output is similar to previous iterations. Continue?",
		autoMode: false,
		scratchpadPath: context.scratchpadPath,
	});

	return loopApproval === "abort";
}

async function executeSimpleLoop(
	context: LoopContext,
	backend: Backend,
	issueNumber: number,
	config: Config,
	collector: ReportCollector | null,
	logWriter: LogWriter,
	sessionRecorder?: SessionRecorder,
	taskId?: string,
	onStateChange?: TaskStateCallback,
	signal?: AbortSignal,
): Promise<void> {
	const taskLogger = taskId ? createTaskLogger(taskId) : logger;
	const historyPath = taskId ? `.agent/${taskId}/output_history.txt` : ".agent/output_history.txt";
	const state: LoopState = { consecutiveFailures: 0, completionReason: "max_iterations" };

	mkdirSync(dirname(historyPath), { recursive: true });

	while (context.iteration < context.maxIterations) {
		if (signal?.aborted) {
			taskLogger.warn("Task cancelled");
			return;
		}

		const iterResult = await executeSimpleIteration(
			context,
			backend,
			collector,
			logWriter,
			historyPath,
			state,
			sessionRecorder,
			taskLogger,
			taskId,
			onStateChange,
		);

		if (iterResult.shouldStop) {
			await handleLoopEnd(context, config, collector, null, state, issueNumber, taskId);
			if (iterResult.error) throw iterResult.error;
			return;
		}

		if (iterResult.loopDetected) {
			const shouldAbort = await handleLoopDetection(context, taskLogger);
			if (shouldAbort) {
				state.completionReason = "aborted";
				await finalizeReport(
					context,
					config,
					collector,
					null,
					state.completionReason,
					state.prResult,
				);
				return;
			}
		}

		await sleep(1000);
	}

	taskLogger.error(`Max iterations (${context.maxIterations}) reached without completion`);
	await updateIssueLabel(issueNumber, "env:blocked");
	await finalizeReport(context, config, collector, null, state.completionReason, state.prResult);
	throw new Error("Max iterations reached");
}

async function executeSimpleIteration(
	context: LoopContext,
	backend: Backend,
	collector: ReportCollector | null,
	logWriter: LogWriter,
	historyPath: string,
	state: LoopState,
	sessionRecorder?: SessionRecorder,
	taskLogger: typeof logger = logger,
	taskId?: string,
	onStateChange?: TaskStateCallback,
): Promise<IterationResult> {
	context.iteration++;
	const iterStartTime = new Date();

	onStateChange?.({ iteration: context.iteration });
	printIterationHeader(context.iteration, context.maxIterations, undefined, taskId);

	const prompt = readFileSync(context.promptPath, "utf-8");
	taskLogger.info(`Iteration ${context.iteration}: Executing ${backend.name}...`);

	const result = await backend.execute(prompt);
	const iterEndTime = new Date();

	const iterationHeader = `\n--- Iteration ${context.iteration} ---\n`;
	await logWriter.writeOutput(iterationHeader);
	await logWriter.writeStdout(result.output);

	taskLogger.debug(`Output (truncated): ${result.output.slice(0, 500)}...`);

	collector?.recordIteration({
		startTime: iterStartTime,
		endTime: iterEndTime,
		durationMs: iterEndTime.getTime() - iterStartTime.getTime(),
		exitCode: result.exitCode,
	});

	const isComplete = checkCompletion(result.output, context.completionPromise);
	const events: string[] = isComplete ? [context.completionPromise] : [];

	if (sessionRecorder) {
		await sessionRecorder.recordIteration(
			context.iteration,
			"simple",
			prompt,
			result.output,
			events,
		);
	}

	if (result.exitCode !== 0) {
		return handleIterationFailure(state, taskLogger);
	}

	state.consecutiveFailures = 0;

	if (isComplete) {
		state.completionReason = "completed";
		return { shouldStop: true };
	}

	const loopDetected = checkLoopDetection(result.output, historyPath, taskLogger);
	return { shouldStop: false, loopDetected };
}

function printIterationHeader(
	iteration: number,
	max: number,
	hat?: HatDefinition,
	taskId?: string,
): void {
	const taskPrefix = taskId ? `[${taskId}] ` : "";
	console.log("");
	console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
	if (hat) {
		console.log(chalk.cyan(`  ${taskPrefix}ITERATION ${iteration}/${max} │ ${hat.name ?? hat.id}`));
	} else {
		console.log(chalk.cyan(`  ${taskPrefix}ITERATION ${iteration}/${max}`));
	}
	console.log(chalk.cyan("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
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

/**
 * 改善提案からIssueを自動作成する
 *
 * @param context ループコンテキスト
 * @param config 設定
 * @param taskLogger タスクロガー
 */
async function handleIssueGeneration(
	context: LoopContext,
	config: Config,
	taskLogger: typeof logger,
): Promise<void> {
	const autoIssueConfig = config.auto_issue;

	// 設定が無効または未設定の場合はスキップ
	if (!autoIssueConfig?.enabled) {
		return;
	}

	taskLogger.info("改善提案の抽出を開始...");

	try {
		// Scratchpadから改善提案を抽出
		const improvements = await extractImprovements(context);

		if (improvements.length === 0) {
			taskLogger.info("改善提案は見つかりませんでした");
			return;
		}

		taskLogger.info(`${improvements.length}件の改善提案を検出しました`);

		// IssueGeneratorで改善Issueを作成
		const issueGenerator = new IssueGenerator({
			enabled: autoIssueConfig.enabled,
			min_priority: autoIssueConfig.min_priority,
			labels: autoIssueConfig.labels,
			repository: autoIssueConfig.repository,
		});

		const createdIssues = await issueGenerator.createIssues(improvements);

		if (createdIssues.length > 0) {
			taskLogger.success(`${createdIssues.length}件の改善Issueを作成しました`);
			for (const url of createdIssues) {
				taskLogger.info(`  - ${url}`);
			}
		}
	} catch (error) {
		taskLogger.warn(
			`改善Issue作成中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`,
		);
		// エラーは警告のみ、処理は継続
	}
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
	console.log(chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
	console.log(chalk.green(`  ${taskPrefix}CREATING PULL REQUEST`));
	console.log(chalk.green("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
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

const environmentBuilderCache = new Map<number, HybridEnvironmentBuilder>();

async function buildHybridEnvironment(
	options: LoopOptions,
	issueNumber: number,
	taskLogger: typeof logger,
): Promise<EnvironmentInfo | null> {
	const worktreeConfig = options.worktreeConfig ?? options.config.worktree;
	const sandboxConfig = options.sandboxConfig ?? options.config.sandbox;

	const worktreeDisabled = !worktreeConfig?.enabled;
	const sandboxIsHost = !sandboxConfig || sandboxConfig.type === "host";

	if (worktreeDisabled && sandboxIsHost) {
		return null;
	}

	const projectRoot = process.cwd();
	const effectiveWorktreeConfig = worktreeConfig ?? {
		enabled: false,
		base_dir: ".worktrees",
		auto_cleanup: true,
		copy_env_files: [".env", ".envrc", ".env.local"],
	};
	const effectiveSandboxConfig = sandboxConfig ?? {
		type: "host" as const,
	};

	const worktreeManager = new WorktreeManager(effectiveWorktreeConfig, projectRoot);
	const builder = new HybridEnvironmentBuilder(
		{
			worktree: effectiveWorktreeConfig,
			sandbox: effectiveSandboxConfig,
			container: options.config.container,
		},
		worktreeManager,
		projectRoot,
	);

	environmentBuilderCache.set(issueNumber, builder);

	try {
		const envInfo = await builder.buildEnvironment(issueNumber);
		taskLogger.info(`Environment created: ${envInfo.type} (${envInfo.workingDirectory})`);
		if (envInfo.environmentId) {
			taskLogger.info(`Environment ID: ${envInfo.environmentId}`);
		}
		return envInfo;
	} catch (error) {
		taskLogger.warn(
			`Failed to build hybrid environment: ${error instanceof Error ? error.message : String(error)}`,
		);
		return null;
	}
}

async function cleanupHybridEnvironment(
	options: LoopOptions,
	issueNumber: number,
	taskLogger: typeof logger,
): Promise<void> {
	const builder = environmentBuilderCache.get(issueNumber);
	if (!builder) {
		return;
	}

	try {
		await builder.destroyEnvironment(issueNumber);
		taskLogger.info(`Environment cleaned up for Issue #${issueNumber}`);
	} catch (error) {
		taskLogger.warn(
			`Failed to cleanup environment: ${error instanceof Error ? error.message : String(error)}`,
		);
	} finally {
		environmentBuilderCache.delete(issueNumber);
	}
}
