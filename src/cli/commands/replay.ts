/**
 * replayコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import { logger } from "../../core/logger.js";
import { SessionReplayer } from "../../core/session-replayer.js";
import type { CommandHandler } from "./types.js";

/**
 * replayコマンドハンドラー
 */
export class ReplayCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("replay <file>")
			.description("Replay a recorded session")
			.action(async (file: string) => {
				try {
					await this.execute(file);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(file: string): Promise<void> {
		const replayer = new SessionReplayer(file);
		const result = await replayer.replay();

		if (result.success) {
			logger.success(`Replay completed: ${result.iterations} iterations`);
		} else {
			logger.error(`Replay failed: ${result.errors.length} error(s)`);
			for (const error of result.errors) {
				logger.error(`  ${error}`);
			}
			process.exit(1);
		}
	}
}

export const replayCommand = new ReplayCommand();
