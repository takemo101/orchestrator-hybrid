import chalk from "chalk";
import type { globalEventBus, OrchEvent } from "./event.js";
import { logger } from "./logger.js";
import type { Hat } from "./types.js";

export interface HatDefinition extends Hat {
	id: string;
}

export interface HatContext {
	eventBus: typeof globalEventBus;
	currentEvent?: OrchEvent;
	iteration: number;
}

export class HatRegistry {
	private hats: Map<string, HatDefinition> = new Map();
	private activeHatId: string | null = null;

	register(id: string, hat: Hat): void {
		this.hats.set(id, { ...hat, id });
		logger.debug(`Registered hat: ${id}`);
	}

	registerFromConfig(hatsConfig: Record<string, Hat>): void {
		for (const [id, hat] of Object.entries(hatsConfig)) {
			this.register(id, hat);
		}
	}

	get(id: string): HatDefinition | undefined {
		return this.hats.get(id);
	}

	getAll(): HatDefinition[] {
		return Array.from(this.hats.values());
	}

	findByTrigger(eventType: string): HatDefinition | undefined {
		for (const hat of this.hats.values()) {
			if (this.matchesTrigger(hat.triggers, eventType)) {
				return hat;
			}
		}
		return undefined;
	}

	private matchesTrigger(triggers: string[], eventType: string): boolean {
		for (const trigger of triggers) {
			if (trigger === eventType) {
				return true;
			}

			if (trigger.endsWith(".*")) {
				const prefix = trigger.slice(0, -2);
				if (eventType.startsWith(`${prefix}.`)) {
					return true;
				}
			}

			if (trigger === "*") {
				return true;
			}
		}
		return false;
	}

	setActive(id: string | null): void {
		this.activeHatId = id;
		if (id) {
			const hat = this.hats.get(id);
			if (hat) {
				printHatSwitch(hat);
			}
		}
	}

	getActive(): HatDefinition | undefined {
		if (!this.activeHatId) {
			return undefined;
		}
		return this.hats.get(this.activeHatId);
	}

	getActiveId(): string | null {
		return this.activeHatId;
	}
}

function printHatSwitch(hat: HatDefinition): void {
	const displayName = hat.name ?? hat.id;
	console.log("");
	console.log(chalk.magenta(`  🎭 Switching to: ${displayName}`));
	console.log(chalk.gray(`     Triggers: ${hat.triggers.join(", ")}`));
	console.log(chalk.gray(`     Publishes: ${hat.publishes.join(", ")}`));
	console.log("");
}

export function buildHatPrompt(
	hat: HatDefinition,
	basePrompt: string,
	context: HatContext,
): string {
	const hatSection = `
## Current Role: ${hat.name ?? hat.id}

${hat.instructions ?? ""}

### Available Events to Publish
${hat.publishes.map((e) => `- ${e}`).join("\n")}

When you complete your role's task, output one of the events above.
For example: EVENT: ${hat.publishes[0]}

---

`;

	return hatSection + basePrompt;
}

export function extractPublishedEvent(
	output: string,
	hat: HatDefinition,
): string | null {
	const eventPattern = /EVENT:\s*(\S+)/i;
	const match = output.match(eventPattern);

	if (match) {
		const eventType = match[1];
		if (hat.publishes.includes(eventType)) {
			return eventType;
		}
		logger.warn(
			`Hat ${hat.id} tried to publish unauthorized event: ${eventType}`,
		);
	}

	for (const publishable of hat.publishes) {
		if (output.includes(publishable)) {
			return publishable;
		}
	}

	return null;
}

export const globalHatRegistry = new HatRegistry();
