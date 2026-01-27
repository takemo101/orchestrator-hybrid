/**
 * logsコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 * v2.0.0 F-104: logsコマンド拡張（--source オプション追加）
 */

import { existsSync, watch } from "node:fs";
import { join } from "node:path";
import chalk from "chalk";
import type { Command } from "commander";
import { findTaskLogPath, readLastNLines } from "../../cli-logs.js";
import { LogStreamer } from "../../core/log-streamer.js";
import { logger } from "../../core/logger.js";
import type { TaskState } from "../../core/task-manager.js";
import { TaskStore } from "../../core/task-manager.js";
import { getStatusIcon } from "../utils/format.js";
import type { CommandHandler, LogsCommandOptions, LogSource } from "./types.js";

/**
 * ログソースに応じたログファイル名を取得
 *
 * @param source - ログソース（task | backend）
 * @returns ログファイル名
 */
export function getLogFileName(source: LogSource | undefined): string {
	return source === "backend" ? "backend.log" : "task.log";
}

/**
 * ログソースに応じたログファイルパスを取得
 *
 * @param taskDir - タスクディレクトリパス
 * @param source - ログソース（task | backend）
 * @returns ログファイルパス（存在しない場合はnull）
 */
export function findLogPath(taskDir: string, source: LogSource | undefined): string | null {
	const logFileName = getLogFileName(source);
	const logPath = join(taskDir, logFileName);
	return existsSync(logPath) ? logPath : null;
}

/**
 * logsコマンドハンドラー
 */
export class LogsCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("logs")
			.description("Show task logs or watch task status")
			.option("-f, --follow", "Follow mode (stream logs in real-time or watch task status)")
			.option("-t, --task <id>", "Task ID to show logs for")
			.option(
				"-s, --source <type>",
				"Log source: task (orchestrator logs) or backend (AI agent output)",
				"task",
			)
			.option("-n, --lines <num>", "Number of lines to display (default: 100)", Number.parseInt)
			.option("--table", "Show task status table (legacy mode)")
			.option("--interval <ms>", "Refresh interval in ms for table mode", Number.parseInt)
			.action(async (options: LogsCommandOptions) => {
				try {
					await this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(options: LogsCommandOptions): Promise<void> {
		// タスクIDが指定された場合はログを表示
		if (options.task) {
			await this.handleTaskLogs(options);
			return;
		}

		// --table または 旧来の動作（タスクテーブル表示）
		this.handleTaskTable(options);
	}

	private async handleTaskLogs(options: LogsCommandOptions): Promise<void> {
		const taskId = options.task as string;
		const source = options.source;

		// 無効なソース指定のチェック
		if (source && source !== "task" && source !== "backend") {
			throw new Error(`Invalid log source: ${source}. Must be 'task' or 'backend'`);
		}

		// タスクディレクトリを検索
		const taskDir = await this.findTaskDir(taskId);
		if (!taskDir) {
			throw new Error(`Task directory not found for: ${taskId}`);
		}

		// ログファイルパスを取得
		const logPath = findLogPath(taskDir, source);
		if (!logPath) {
			const logFileName = getLogFileName(source);
			throw new Error(`Log file not found: ${logFileName} (task: ${taskId})`);
		}

		const sourceLabel = source === "backend" ? "backend" : "task";

		if (options.follow) {
			// リアルタイムストリーミングモード
			const streamer = new LogStreamer({
				taskId,
				follow: true,
				logFileName: getLogFileName(source),
			});

			logger.info(`Streaming ${sourceLabel} logs for task: ${taskId} (Ctrl+C to stop)`);
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
				logger.info(`No ${sourceLabel} logs found for task: ${taskId}`);
				return;
			}

			for (const line of lines) {
				console.log(line);
			}
		}
	}

	/**
	 * タスクディレクトリを検索
	 */
	private async findTaskDir(taskId: string): Promise<string | null> {
		// .agent 配下のタスクディレクトリを検索
		const baseDir = ".agent";

		// 完全一致
		const exactPath = join(baseDir, taskId);
		if (existsSync(exactPath)) {
			return exactPath;
		}

		// 既存のfindTaskLogPath関数を使用してログパスを取得し、ディレクトリを抽出
		const logPath = await findTaskLogPath(taskId);
		if (logPath) {
			// ログパスからディレクトリを抽出
			const parts = logPath.split("/");
			parts.pop(); // ファイル名を除去
			return parts.join("/");
		}

		return null;
	}

	private handleTaskTable(options: LogsCommandOptions): void {
		const store = new TaskStore();
		const interval = options.interval ?? 1000;

		if (!options.follow) {
			const tasks = store.getAll();

			if (tasks.length === 0) {
				logger.info("No tasks found");
				return;
			}

			this.printTaskTable(tasks);
			return;
		}

		logger.info("Watching tasks... (Ctrl+C to stop)");
		console.log("");

		let lastSnapshot = "";

		const printUpdate = () => {
			const tasks = store.getAll();
			const result = this.renderTaskMonitor(tasks, lastSnapshot);
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

	private renderTaskMonitor(
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
			this.printTaskMonitorLine(task);
		}

		this.printTaskMonitorSummary(tasks);
		return { changed: true, snapshot };
	}

	private printTaskMonitorLine(task: TaskState): void {
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

	private printTaskMonitorSummary(tasks: Array<TaskState | undefined>): void {
		const running = tasks.filter((t) => t?.status === "running").length;
		const completed = tasks.filter((t) => t?.status === "completed").length;
		const failed = tasks.filter((t) => t?.status === "failed").length;

		console.log("");
		console.log(chalk.gray(`Running: ${running} | Completed: ${completed} | Failed: ${failed}`));
	}

	private printTaskTable(tasks: TaskState[]): void {
		console.log("");
		console.log(
			chalk.gray(
				"ID".padEnd(20) +
					"Issue".padEnd(8) +
					"Status".padEnd(12) +
					"Hat".padEnd(15) +
					"Iter".padEnd(10),
			),
		);
		console.log(chalk.gray("─".repeat(70)));

		for (const task of tasks) {
			const statusIcon = getStatusIcon(task.status);
			const hat = task.currentHat ?? "-";
			const iter = `${task.iteration}/${task.maxIterations}`;

			console.log(
				`${task.id.padEnd(20)}` +
					`#${task.issueNumber.toString().padEnd(7)}` +
					`${statusIcon} ${task.status.padEnd(10)}` +
					`${hat.substring(0, 13).padEnd(15)}` +
					`${iter}`,
			);
		}
		console.log("");
	}
}

export const logsCommand = new LogsCommand();
