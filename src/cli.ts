#!/usr/bin/env node

import { existsSync, readFileSync, watch, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import { findTaskLogPath, readLastNLines } from "./cli-logs.js";
import { loadConfig } from "./core/config.js";
import { EventBus } from "./core/event.js";
import { LogStreamer } from "./core/log-streamer.js";
import { logger, setVerbose } from "./core/logger.js";
import { runLoop, runMultipleLoops } from "./core/loop.js";
import { readScratchpad } from "./core/scratchpad.js";
import type { TaskState } from "./core/task-manager.js";
import { TaskManager, TaskStore } from "./core/task-manager.js";
import type { PRConfig } from "./core/types.js";
import { fetchIssue } from "./input/github.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "..", "presets");

const program = new Command();

program
	.name("orch")
	.description("AI agent orchestrator combining Ralph loop with GitHub Issue integration")
	.version("0.1.0");

program
	.command("run")
	.description("Start orchestration loop")
	.option("-i, --issue <number>", "GitHub issue number (single)")
	.option("--issues <numbers>", "GitHub issue numbers (comma-separated for parallel)")
	.option("-b, --backend <type>", "Backend: claude, opencode")
	.option("-p, --preset <name>", "Use preset configuration (tdd, spec-driven, simple)")
	.option("-m, --max-iterations <number>", "Maximum iterations", Number.parseInt)
	.option("-a, --auto", "Auto-approve all gates")
	.option("--create-pr", "Create PR after completion")
	.option("--draft", "Create PR as draft")
	.option("--container", "Run in isolated container-use environment")
	.option("--auto-merge", "Auto-merge PR after CI passes")
	.option("--report [path]", "Generate execution report (default: .agent/report.md)")
	.option("-c, --config <path>", "Config file path")
	.option("-v, --verbose", "Verbose output")
	.action(async (options) => {
		try {
			await handleRunCommand(options);
		} catch (error) {
			logger.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

async function handleRunCommand(options: {
	verbose?: boolean;
	issue?: string;
	issues?: string;
	preset?: string;
	config?: string;
	backend?: string;
	auto?: boolean;
	maxIterations?: number;
	createPr?: boolean;
	draft?: boolean;
	container?: boolean;
	autoMerge?: boolean;
	report?: string | boolean;
}): Promise<void> {
	if (options.verbose) {
		setVerbose(true);
	}

	if (!options.issue && !options.issues) {
		logger.error("Either --issue or --issues is required");
		process.exit(1);
	}

	let config: ReturnType<typeof loadConfig>;
	if (options.preset) {
		logger.info(`Using preset: ${options.preset}`);
		config = loadPreset(options.preset);
	} else {
		config = loadConfig(options.config);
	}

	if (options.backend) {
		config.backend.type = options.backend as "claude" | "opencode" | "gemini" | "container";
	}

	// PR設定を構築（CLIオプションが設定ファイルより優先）
	const prConfig: PRConfig = {
		autoMerge: options.autoMerge ?? config.pr?.autoMerge ?? false,
		mergeMethod: config.pr?.mergeMethod ?? "squash",
		deleteBranch: config.pr?.deleteBranch ?? true,
		ciTimeoutSecs: config.pr?.ciTimeoutSecs ?? 600,
	};

	if (options.issues) {
		await handleMultipleIssues(options, config, prConfig);
	} else {
		await handleSingleIssue(options, config, prConfig);
	}
}

async function handleMultipleIssues(
	options: {
		issues?: string;
		auto?: boolean;
		maxIterations?: number;
		createPr?: boolean;
		draft?: boolean;
		container?: boolean;
		report?: string | boolean;
		preset?: string;
	},
	config: ReturnType<typeof loadConfig>,
	prConfig: PRConfig,
): Promise<void> {
	const issueNumbers = (options.issues ?? "")
		.split(",")
		.map((n: string) => Number.parseInt(n.trim(), 10))
		.filter((n: number) => !Number.isNaN(n));

	if (issueNumbers.length === 0) {
		logger.error("No valid issue numbers provided");
		process.exit(1);
	}

	logger.info(`Starting parallel execution for issues: ${issueNumbers.join(", ")}`);

	const taskManager = new TaskManager();

	await runMultipleLoops(
		{
			issueNumbers,
			config,
			autoMode: options.auto ?? false,
			maxIterations: options.maxIterations,
			createPR: options.createPr ?? false,
			draftPR: options.draft ?? false,
			useContainer: options.container ?? false,
			generateReport: options.report !== undefined,
			preset: options.preset,
			prConfig,
		},
		taskManager,
	);

	printTaskSummary(taskManager.getAllTasks());
}

async function handleSingleIssue(
	options: {
		issue?: string;
		auto?: boolean;
		maxIterations?: number;
		createPr?: boolean;
		draft?: boolean;
		container?: boolean;
		report?: string | boolean;
		preset?: string;
	},
	config: ReturnType<typeof loadConfig>,
	prConfig: PRConfig,
): Promise<void> {
	const issueNumber = Number.parseInt(options.issue ?? "0", 10);
	const issue = await fetchIssue(issueNumber);
	const maxIterations = options.maxIterations ?? config.loop.max_iterations;

	const taskManager = new TaskManager();
	const taskState = taskManager.createTask(issue, maxIterations);

	await taskManager.startTask(taskState.id, async (onStateChange, signal) => {
		await runLoop({
			issueNumber,
			config,
			autoMode: options.auto ?? false,
			maxIterations,
			createPR: options.createPr ?? false,
			draftPR: options.draft ?? false,
			useContainer: options.container ?? false,
			generateReport: options.report !== undefined,
			reportPath:
				typeof options.report === "string" ? options.report : `.agent/${taskState.id}/report.md`,
			preset: options.preset,
			taskId: taskState.id,
			prConfig,
			onStateChange,
			signal,
		});
	});

	await taskManager.waitForTask(taskState.id);

	const finalState = taskManager.getTask(taskState.id);
	if (finalState) {
		printTaskSummary([finalState]);
	}
}

program
	.command("status")
	.description("Show task status")
	.option("-i, --issue <number>", "GitHub issue number")
	.option("-t, --task <id>", "Task ID")
	.option("-a, --all", "Show all tasks")
	.option("-c, --config <path>", "Config file path")
	.action(async (options) => {
		try {
			await handleStatusCommand(options);
		} catch (error) {
			logger.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

async function handleStatusCommand(options: {
	all?: boolean;
	task?: string;
	issue?: string;
	config?: string;
}): Promise<void> {
	const store = new TaskStore();

	if (options.all) {
		const tasks = store.getAll();
		if (tasks.length === 0) {
			logger.info("No tasks found");
			return;
		}
		printTaskTable(tasks);
		return;
	}

	if (options.task) {
		const task = store.get(options.task);
		if (!task) {
			logger.error(`Task not found: ${options.task}`);
			process.exit(1);
		}
		printTaskDetail(task);
		return;
	}

	if (options.issue) {
		await showIssueStatus(options.issue, options.config, store);
		return;
	}

	showDefaultStatus(store);
}

async function showIssueStatus(
	issueStr: string,
	configPath: string | undefined,
	store: TaskStore,
): Promise<void> {
	const config = loadConfig(configPath);
	const issueNumber = Number.parseInt(issueStr, 10);

	logger.info(`Status for issue #${issueNumber}:`);

	const issue = await fetchIssue(issueNumber);
	console.log(JSON.stringify(issue, null, 2));

	console.log("");
	logger.info("Scratchpad:");

	const scratchpadPath = config.state?.scratchpad_path ?? ".agent/scratchpad.md";
	console.log(readScratchpad(scratchpadPath));

	const tasks = store.getAll().filter((t) => t.issueNumber === issueNumber);
	if (tasks.length > 0) {
		console.log("");
		logger.info("Related tasks:");
		printTaskTable(tasks);
	}
}

function showDefaultStatus(store: TaskStore): void {
	const runningTasks = store.getByStatus("running");
	if (runningTasks.length > 0) {
		logger.info("Running tasks:");
		printTaskTable(runningTasks);
		return;
	}

	logger.info("No running tasks");

	const recentTasks = store
		.getAll()
		.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
		.slice(0, 5);

	if (recentTasks.length > 0) {
		console.log("");
		logger.info("Recent tasks:");
		printTaskTable(recentTasks);
	}
}

program
	.command("events")
	.description("Show event history")
	.action(() => {
		const eventBus = new EventBus();
		const events = eventBus.getHistory();

		if (events.length === 0) {
			logger.info("No events recorded");
			return;
		}

		console.log("");
		logger.info("Event History:");
		for (const event of events) {
			const hatInfo = event.hatId ? ` (${event.hatId})` : "";
			const time = event.timestamp.toISOString().slice(11, 19);
			console.log(`  [${time}] ${event.type}${hatInfo}`);
		}
		console.log("");
	});

program
	.command("init")
	.description("Initialize configuration file")
	.option("-p, --preset <name>", "Use preset configuration")
	.option("--list-presets", "List available presets")
	.option("-f, --force", "Overwrite existing config")
	.action((options) => {
		if (options.listPresets) {
			listPresets();
			return;
		}

		const configPath = "orch.yml";

		if (existsSync(configPath) && !options.force) {
			logger.error(`${configPath} already exists. Use --force to overwrite.`);
			process.exit(1);
		}

		let content: string;

		if (options.preset) {
			loadPreset(options.preset);
			content = readFileSync(getPresetPath(options.preset), "utf-8");
			logger.info(`Initialized with preset: ${options.preset}`);
		} else {
			content = `version: "1.0"

backend:
  type: claude

loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"

gates:
  after_plan: true
  after_implementation: false
  before_pr: true

state:
  use_github_labels: true
  use_scratchpad: true
`;
			logger.info("Initialized with default configuration");
		}

		writeFileSync(configPath, content);
		logger.success(`Created ${configPath}`);
	});

program
	.command("cancel")
	.description("Cancel running task(s)")
	.option("-t, --task <id>", "Task ID to cancel")
	.option("-a, --all", "Cancel all running tasks")
	.action((options) => {
		const taskManager = new TaskManager();

		if (options.all) {
			const runningTasks = taskManager.getRunningTasks();
			if (runningTasks.length === 0) {
				logger.info("No running tasks to cancel");
				return;
			}

			for (const task of runningTasks) {
				if (taskManager.cancelTask(task.id)) {
					logger.success(`Cancelled task: ${task.id}`);
				}
			}
			return;
		}

		if (options.task) {
			if (taskManager.cancelTask(options.task)) {
				logger.success(`Cancelled task: ${options.task}`);
			} else {
				logger.error(`Task not found or not running: ${options.task}`);
				process.exit(1);
			}
			return;
		}

		logger.error("Specify --task <id> or --all");
		process.exit(1);
	});

program
	.command("clear")
	.description("Clear task history")
	.option("-f, --force", "Skip confirmation")
	.action((options) => {
		if (!options.force) {
			logger.warn("This will clear all task history. Use --force to confirm.");
			return;
		}

		const store = new TaskStore();
		store.clear();
		logger.success("Task history cleared");
	});

program
	.command("logs")
	.description("Show task logs or watch task status")
	.option("-f, --follow", "Follow mode (stream logs in real-time or watch task status)")
	.option("-t, --task <id>", "Task ID to show logs for")
	.option("-n, --lines <num>", "Number of lines to display (default: 100)", Number.parseInt)
	.option("--table", "Show task status table (legacy mode)")
	.option("--interval <ms>", "Refresh interval in ms for table mode", Number.parseInt)
	.action(async (options) => {
		// タスクIDが指定された場合はログを表示
		if (options.task) {
			await handleTaskLogs(options);
			return;
		}

		// --table または 旧来の動作（タスクテーブル表示）
		handleTaskTable(options);
	});

async function handleTaskLogs(options: {
	task: string;
	follow?: boolean;
	lines?: number;
}): Promise<void> {
	const logPath = await findTaskLogPath(options.task);

	if (!logPath) {
		logger.error(`Log file not found for task: ${options.task}`);
		process.exit(1);
	}

	if (options.follow) {
		// リアルタイムストリーミングモード
		const streamer = new LogStreamer({
			taskId: options.task,
			follow: true,
		});

		logger.info(`Streaming logs for task: ${options.task} (Ctrl+C to stop)`);
		console.log("");

		// 既存の行を表示
		const existingLines = await readLastNLines(logPath, options.lines ?? 100);
		for (const line of existingLines) {
			console.log(line);
		}

		// 新しい行をストリーミング
		const streamPromise = streamer.stream((line) => {
			console.log(line);
		});

		process.on("SIGINT", () => {
			streamer.stop();
			console.log("");
			logger.info("Stopped streaming");
			process.exit(0);
		});

		await streamPromise;
	} else {
		// 一度だけ表示モード
		const lines = await readLastNLines(logPath, options.lines ?? 100);

		if (lines.length === 0) {
			logger.info("No logs found");
			return;
		}

		for (const line of lines) {
			console.log(line);
		}
	}
}

function handleTaskTable(options: { follow?: boolean; table?: boolean; interval?: number }): void {
	const store = new TaskStore();
	const interval = options.interval ?? 1000;

	if (!options.follow) {
		const tasks = store.getAll();

		if (tasks.length === 0) {
			logger.info("No tasks found");
			return;
		}

		printTaskTable(tasks as TaskState[]);
		return;
	}

	logger.info("Watching tasks... (Ctrl+C to stop)");
	console.log("");

	let lastSnapshot = "";

	const printUpdate = () => {
		const tasks = store.getAll();
		const result = renderTaskMonitor(tasks, lastSnapshot);
		if (result.changed) {
			lastSnapshot = result.snapshot;
		}
	};

	printUpdate();

	const taskStorePath = ".agent/tasks.json";
	if (existsSync(taskStorePath)) {
		watch(taskStorePath, () => {
			setTimeout(() => printUpdate(), 100);
		});
	}

	const intervalId = setInterval(printUpdate, interval);

	process.on("SIGINT", () => {
		clearInterval(intervalId);
		console.log("");
		logger.info("Stopped watching");
		process.exit(0);
	});
}

program.parse();

function loadPreset(name: string) {
	const presetPath = getPresetPath(name);

	if (!existsSync(presetPath)) {
		throw new Error(`Preset not found: ${name}. Use --list-presets to see available presets.`);
	}

	const content = readFileSync(presetPath, "utf-8");
	return parseYaml(content);
}

function getPresetPath(name: string): string {
	const candidates = [
		join(PRESETS_DIR, `${name}.yml`),
		join(PRESETS_DIR, `${name}.yaml`),
		join(process.cwd(), "presets", `${name}.yml`),
		join(process.cwd(), "presets", `${name}.yaml`),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return candidates[0];
}

function listPresets(): void {
	console.log("");
	logger.info("Available presets:");
	console.log("");

	const presets = [
		{ name: "simple", desc: "Basic loop without hats (default)" },
		{
			name: "tdd",
			desc: "Test-Driven Development (Tester → Implementer → Refactorer)",
		},
		{
			name: "spec-driven",
			desc: "Specification-driven (Planner → Builder → Reviewer)",
		},
	];

	for (const preset of presets) {
		console.log(`  ${preset.name.padEnd(15)} ${preset.desc}`);
	}

	console.log("");
	console.log("Usage: orch init --preset <name>");
	console.log("       orch run --issue <n> --preset <name>");
	console.log("");
}

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const seconds = Math.floor(diff / 1000);

	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

function getStatusIcon(status: string): string {
	switch (status) {
		case "pending":
			return chalk.gray("○");
		case "running":
			return chalk.blue("●");
		case "completed":
			return chalk.green("✓");
		case "failed":
			return chalk.red("✗");
		case "cancelled":
			return chalk.yellow("⊘");
		default:
			return "?";
	}
}

function renderTaskMonitor(
	tasks: Array<TaskState | undefined>,
	lastSnapshot: string,
): { changed: boolean; snapshot: string } {
	const snapshot = JSON.stringify(
		tasks.map((t) => ({
			id: t?.id,
			status: t?.status,
			iteration: t?.iteration,
			hat: t?.currentHat,
			event: t?.lastEvent,
		})),
	);

	if (snapshot === lastSnapshot) {
		return { changed: false, snapshot: lastSnapshot };
	}

	console.clear();
	console.log(chalk.bold(`Task Monitor - ${new Date().toLocaleTimeString()}`));
	console.log("");

	if (tasks.length === 0) {
		console.log(chalk.gray("No tasks found"));
		return { changed: true, snapshot };
	}

	for (const task of tasks) {
		if (!task) continue;
		printTaskMonitorLine(task);
	}

	printTaskMonitorSummary(tasks);
	return { changed: true, snapshot };
}

function printTaskMonitorLine(task: TaskState): void {
	const statusIcon = getStatusIcon(task.status);
	const hat = task.currentHat ?? "-";
	const iter = `${task.iteration}/${task.maxIterations}`;
	const event = task.lastEvent ?? "-";

	console.log(
		`${statusIcon} ${chalk.bold(task.id)} ` +
			`#${task.issueNumber} ` +
			`[${iter}] ` +
			chalk.cyan(hat) +
			(event !== "-" ? ` → ${chalk.yellow(event)}` : ""),
	);
}

function printTaskMonitorSummary(tasks: Array<TaskState | undefined>): void {
	const running = tasks.filter((t) => t?.status === "running").length;
	const completed = tasks.filter((t) => t?.status === "completed").length;
	const failed = tasks.filter((t) => t?.status === "failed").length;

	console.log("");
	console.log(chalk.gray(`Running: ${running} | Completed: ${completed} | Failed: ${failed}`));
}

function printTaskTable(
	tasks: Array<{
		id: string;
		issueNumber: number;
		issueTitle: string;
		status: string;
		currentHat: string | null;
		iteration: number;
		maxIterations: number;
		updatedAt: Date;
	}>,
): void {
	console.log("");
	console.log(
		chalk.gray(
			"ID".padEnd(20) +
				"Issue".padEnd(8) +
				"Status".padEnd(12) +
				"Hat".padEnd(15) +
				"Iter".padEnd(10) +
				"Updated",
		),
	);
	console.log(chalk.gray("─".repeat(80)));

	for (const task of tasks) {
		const statusIcon = getStatusIcon(task.status);
		const hat = task.currentHat ?? "-";
		const iter = `${task.iteration}/${task.maxIterations}`;
		const updated = formatRelativeTime(task.updatedAt);

		console.log(
			`${task.id.padEnd(20)}` +
				`#${task.issueNumber.toString().padEnd(7)}` +
				`${statusIcon} ${task.status.padEnd(10)}` +
				`${hat.substring(0, 13).padEnd(15)}` +
				`${iter.padEnd(10)}` +
				`${updated}`,
		);
	}
	console.log("");
}

function printTaskDetail(task: {
	id: string;
	issueNumber: number;
	issueTitle: string;
	status: string;
	currentHat: string | null;
	iteration: number;
	maxIterations: number;
	lastEvent: string | null;
	error: string | null;
	startedAt: Date | null;
	updatedAt: Date;
	completedAt: Date | null;
}): void {
	console.log("");
	console.log(chalk.bold(`Task: ${task.id}`));
	console.log(chalk.gray("─".repeat(50)));
	console.log(`Issue:       #${task.issueNumber} - ${task.issueTitle}`);
	console.log(`Status:      ${getStatusIcon(task.status)} ${task.status}`);
	console.log(`Iteration:   ${task.iteration}/${task.maxIterations}`);
	console.log(`Current Hat: ${task.currentHat ?? "-"}`);
	console.log(`Last Event:  ${task.lastEvent ?? "-"}`);

	if (task.startedAt) {
		console.log(`Started:     ${task.startedAt.toISOString()}`);
	}
	console.log(`Updated:     ${task.updatedAt.toISOString()}`);
	if (task.completedAt) {
		console.log(`Completed:   ${task.completedAt.toISOString()}`);
		if (task.startedAt) {
			const duration = task.completedAt.getTime() - task.startedAt.getTime();
			console.log(`Duration:    ${formatDuration(duration)}`);
		}
	}

	if (task.error) {
		console.log("");
		console.log(chalk.red(`Error: ${task.error}`));
	}
	console.log("");
}

function printTaskSummary(
	tasks: Array<{
		id: string;
		issueNumber: number;
		status: string;
		error: string | null;
	}>,
): void {
	console.log("");
	console.log(chalk.bold("Execution Summary"));
	console.log(chalk.gray("─".repeat(50)));

	const completed = tasks.filter((t) => t.status === "completed").length;
	const failed = tasks.filter((t) => t.status === "failed").length;
	const cancelled = tasks.filter((t) => t.status === "cancelled").length;

	console.log(`Total:     ${tasks.length}`);
	console.log(`Completed: ${chalk.green(completed.toString())}`);
	if (failed > 0) console.log(`Failed:    ${chalk.red(failed.toString())}`);
	if (cancelled > 0) console.log(`Cancelled: ${chalk.yellow(cancelled.toString())}`);

	const failedTasks = tasks.filter((t) => t.status === "failed");
	if (failedTasks.length > 0) {
		console.log("");
		console.log(chalk.red("Failed tasks:"));
		for (const task of failedTasks) {
			console.log(`  - #${task.issueNumber}: ${task.error ?? "Unknown error"}`);
		}
	}
	console.log("");
}
