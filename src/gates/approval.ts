import { select } from "@inquirer/prompts";
import chalk from "chalk";
import { logger } from "../core/logger.js";
import { readScratchpad } from "../core/scratchpad.js";

export interface ApprovalOptions {
	gateName: string;
	message: string;
	autoMode: boolean;
	scratchpadPath?: string;
}

export type ApprovalResult = "continue" | "abort";

export async function requestApproval(options: ApprovalOptions): Promise<ApprovalResult> {
	const { gateName, message, autoMode, scratchpadPath } = options;

	if (autoMode) {
		logger.info(`[AUTO] Approval gate '${gateName}' auto-approved`);
		return "continue";
	}

	console.log("");
	console.log(chalk.yellow("════════════════════════════════════════════════════════════"));
	console.log(chalk.yellow(`  APPROVAL GATE: ${gateName}`));
	console.log(chalk.yellow("════════════════════════════════════════════════════════════"));
	console.log("");
	console.log(message);
	console.log("");

	const answer = await select({
		message: "Select action:",
		choices: [
			{ name: "1. Continue (approve)", value: "continue" },
			{ name: "2. Abort", value: "abort" },
			{ name: "3. View scratchpad", value: "view" },
		],
	});

	if (answer === "view") {
		console.log("");
		console.log("=== Scratchpad Contents ===");
		console.log(readScratchpad(scratchpadPath ?? ".agent/scratchpad.md"));
		console.log("===========================");
		console.log("");

		return requestApproval(options);
	}

	if (answer === "continue") {
		logger.success("Approved");
		return "continue";
	}

	logger.warn("Aborted by user");
	return "abort";
}
