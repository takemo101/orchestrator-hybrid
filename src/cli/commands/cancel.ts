/**
 * cancelコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import { logger } from "../../core/logger.js";
import { TaskManager } from "../../core/task-manager.js";
import type { CancelCommandOptions, CommandHandler } from "./types.js";

/**
 * cancelコマンドハンドラー
 */
export class CancelCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("cancel")
			.description("Cancel running task(s)")
			.option("-t, --task <id>", "Task ID to cancel")
			.option("-a, --all", "Cancel all running tasks")
			.action((options: CancelCommandOptions) => {
				try {
					this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	execute(options: CancelCommandOptions): void {
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
				throw new Error(`Task not found or not running: ${options.task}`);
			}
			return;
		}

		throw new Error("Specify --task <id> or --all");
	}
}

export const cancelCommand = new CancelCommand();
