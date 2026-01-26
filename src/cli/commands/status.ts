/**
 * statusコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import chalk from "chalk";
import type { Command } from "commander";
import { loadConfig } from "../../core/config.js";
import { logger } from "../../core/logger.js";
import { readScratchpad } from "../../core/scratchpad.js";
import { TaskStore } from "../../core/task-manager.js";
import { fetchIssue } from "../../input/github.js";
import { formatDuration, formatRelativeTime, getStatusIcon } from "../utils/format.js";
import type { CommandHandler, StatusCommandOptions } from "./types.js";

/**
 * statusコマンドハンドラー
 */
export class StatusCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("status")
			.description("Show task status")
			.option("-i, --issue <number>", "GitHub issue number")
			.option("-t, --task <id>", "Task ID")
			.option("-a, --all", "Show all tasks")
			.option("-c, --config <path>", "Config file path")
			.action(async (options: StatusCommandOptions) => {
				try {
					await this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(options: StatusCommandOptions): Promise<void> {
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
				throw new Error(`Task not found: ${options.task}`);
			}
			printTaskDetail(task);
			return;
		}

		if (options.issue) {
			await this.showIssueStatus(options.issue, options.config, store);
			return;
		}

		this.showDefaultStatus(store);
	}

	private async showIssueStatus(
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

	private showDefaultStatus(store: TaskStore): void {
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
}

/**
 * タスクテーブルを表示する
 */
export function printTaskTable(
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

/**
 * タスク詳細を表示する
 */
export function printTaskDetail(task: {
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

/**
 * タスクサマリーを表示する
 */
export function printTaskSummary(
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

export const statusCommand = new StatusCommand();
