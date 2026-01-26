/**
 * clearコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import { logger } from "../../core/logger.js";
import { TaskStore } from "../../core/task-manager.js";
import type { CommandHandler } from "./types.js";

/**
 * clearコマンドオプション
 */
export interface ClearCommandOptions {
	force?: boolean;
}

/**
 * clearコマンドハンドラー
 */
export class ClearCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("clear")
			.description("Clear task history")
			.option("-f, --force", "Skip confirmation")
			.action((options: ClearCommandOptions) => {
				try {
					this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	execute(options: ClearCommandOptions): void {
		if (!options.force) {
			logger.warn("This will clear all task history. Use --force to confirm.");
			return;
		}

		const store = new TaskStore();
		store.clear();
		logger.success("Task history cleared");
	}
}

export const clearCommand = new ClearCommand();
