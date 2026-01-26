/**
 * toolsコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import chalk from "chalk";
import { loadConfig } from "../../core/config.js";
import { logger } from "../../core/logger.js";
import { OrchTaskManager } from "../../core/orch-task-manager.js";
import type { TasksConfig } from "../../core/types.js";
import { getTaskStatusIcon } from "../utils/format.js";
import type { CommandHandler, TaskToolOptions } from "./types.js";

/**
 * toolsコマンドハンドラー
 */
export class ToolsCommand implements CommandHandler {
	register(program: Command): void {
		const toolsCommand = program.command("tools").description("Utility tools");
		const taskCommand = toolsCommand
			.command("task")
			.description("Manage tasks in .agent/tasks.jsonl");

		this.registerTaskAdd(taskCommand);
		this.registerTaskList(taskCommand);
		this.registerTaskReady(taskCommand);
		this.registerTaskClose(taskCommand);
	}

	private registerTaskAdd(taskCommand: Command): void {
		taskCommand
			.command("add <title>")
			.description("Add a new task")
			.option("-p, --priority <number>", "Priority (1-5, lower is higher)", "3")
			.option("--blocked-by <ids>", "Comma-separated task IDs that block this task")
			.action(async (title: string, options: TaskToolOptions) => {
				try {
					const config = loadConfig();
					const tasksConfig: TasksConfig = config.tasks ?? { enabled: true };
					const manager = new OrchTaskManager(tasksConfig, ".agent");

					const priority = Number.parseInt(options.priority ?? "3", 10);
					if (Number.isNaN(priority) || priority < 1 || priority > 5) {
						throw new Error("Priority must be a number between 1 and 5");
					}

					const blockedBy = options.blockedBy
						? options.blockedBy.split(",").map((id) => id.trim())
						: [];

					const taskId = await manager.addTask(title, priority, blockedBy);
					if (taskId) {
						logger.success(`Created task: ${taskId}`);
					}
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	private registerTaskList(taskCommand: Command): void {
		taskCommand
			.command("list")
			.description("List all tasks")
			.action(async () => {
				try {
					const config = loadConfig();
					const tasksConfig: TasksConfig = config.tasks ?? { enabled: true };
					const manager = new OrchTaskManager(tasksConfig, ".agent");

					const tasks = await manager.listTasks();

					if (tasks.length === 0) {
						logger.info("No tasks found");
						return;
					}

					console.log("");
					console.log(
						chalk.gray(
							"ID".padEnd(12) +
								"Priority".padEnd(10) +
								"Status".padEnd(14) +
								"Blocked By".padEnd(20) +
								"Title",
						),
					);
					console.log(chalk.gray("─".repeat(80)));

					for (const task of tasks) {
						const statusIcon = getTaskStatusIcon(task.status);
						const blockedBy = task.blocked_by.length > 0 ? task.blocked_by.join(", ") : "-";
						console.log(
							`${task.id.padEnd(12)}` +
								`${task.priority.toString().padEnd(10)}` +
								`${statusIcon} ${task.status.padEnd(12)}` +
								`${blockedBy.substring(0, 18).padEnd(20)}` +
								`${task.title}`,
						);
					}
					console.log("");
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	private registerTaskReady(taskCommand: Command): void {
		taskCommand
			.command("ready")
			.description("List tasks that are not blocked")
			.action(async () => {
				try {
					const config = loadConfig();
					const tasksConfig: TasksConfig = config.tasks ?? { enabled: true };
					const manager = new OrchTaskManager(tasksConfig, ".agent");

					const tasks = await manager.getReadyTasks();

					if (tasks.length === 0) {
						logger.info("No ready tasks found");
						return;
					}

					console.log("");
					console.log(chalk.bold("Ready Tasks:"));
					console.log(chalk.gray("─".repeat(50)));

					for (const task of tasks) {
						console.log(`  ${task.id}: ${task.title} (priority: ${task.priority})`);
					}
					console.log("");
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	private registerTaskClose(taskCommand: Command): void {
		taskCommand
			.command("close <id>")
			.description("Mark a task as closed")
			.action(async (id: string) => {
				try {
					const config = loadConfig();
					const tasksConfig: TasksConfig = config.tasks ?? { enabled: true };
					const manager = new OrchTaskManager(tasksConfig, ".agent");

					await manager.updateStatus(id, "closed");
					logger.success(`Task ${id} marked as closed`);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}
}

export const toolsCommand = new ToolsCommand();
