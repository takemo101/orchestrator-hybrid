/**
 * emitコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import { EventBus } from "../../core/event.js";
import { EventEmitter } from "../../core/event-emitter.js";
import { logger } from "../../core/logger.js";
import type { CommandHandler, EmitCommandOptions } from "./types.js";

/**
 * emitコマンドハンドラー
 */
export class EmitCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("emit")
			.description("Emit an event to the event bus")
			.argument("<topic>", "Event topic")
			.argument("<message>", "Event message or JSON payload")
			.option("-j, --json", "Parse message as JSON payload")
			.option("-t, --target <hat>", "Target hat for handoff")
			.action(async (topic: string, message: string, options: EmitCommandOptions) => {
				try {
					await this.execute(topic, message, options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(topic: string, message: string, options: EmitCommandOptions): Promise<void> {
		const eventBus = new EventBus();
		const emitter = new EventEmitter(eventBus);

		const event = await emitter.emit(topic, message, {
			json: options.json,
			target: options.target,
		});

		logger.success(`イベント発行完了: ${event.type}`);

		if (options.json) {
			console.log(JSON.stringify(event, null, 2));
		}
	}
}

export const emitCommand = new EmitCommand();
