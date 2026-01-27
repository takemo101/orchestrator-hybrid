/**
 * eventsコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import { EventBus } from "../../core/event.js";
import { logger } from "../../core/logger.js";
import type { CommandHandler } from "./types.js";

/**
 * eventsコマンドハンドラー
 */
export class EventsCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("events")
			.description("Show event history")
			.action(() => {
				try {
					this.execute();
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	execute(): void {
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
	}
}

export const eventsCommand = new EventsCommand();
