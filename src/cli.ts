#!/usr/bin/env node

import { Command } from "commander";
import { loadConfig } from "./core/config.js";
import { logger, setVerbose } from "./core/logger.js";
import { runLoop } from "./core/loop.js";
import { readScratchpad } from "./core/scratchpad.js";
import { fetchIssue } from "./input/github.js";

const program = new Command();

program
	.name("orch")
	.description(
		"AI agent orchestrator combining Ralph loop with GitHub Issue integration",
	)
	.version("0.1.0");

program
	.command("run")
	.description("Start orchestration loop")
	.requiredOption("-i, --issue <number>", "GitHub issue number")
	.option("-b, --backend <type>", "Backend: claude, opencode")
	.option(
		"-m, --max-iterations <number>",
		"Maximum iterations",
		Number.parseInt,
	)
	.option("-a, --auto", "Auto-approve all gates")
	.option("-c, --config <path>", "Config file path")
	.option("-v, --verbose", "Verbose output")
	.action(async (options) => {
		try {
			if (options.verbose) {
				setVerbose(true);
			}

			const config = loadConfig(options.config);

			if (options.backend) {
				config.backend.type = options.backend;
			}

			await runLoop({
				issueNumber: Number.parseInt(options.issue, 10),
				config,
				autoMode: options.auto ?? false,
				maxIterations: options.maxIterations,
			});
		} catch (error) {
			logger.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

program
	.command("status")
	.description("Show current status")
	.requiredOption("-i, --issue <number>", "GitHub issue number")
	.option("-c, --config <path>", "Config file path")
	.action(async (options) => {
		try {
			const config = loadConfig(options.config);
			const issueNumber = Number.parseInt(options.issue, 10);

			logger.info(`Status for issue #${issueNumber}:`);

			const issue = await fetchIssue(issueNumber);
			console.log(JSON.stringify(issue, null, 2));

			console.log("");
			logger.info("Scratchpad:");

			const scratchpadPath =
				config.state?.scratchpad_path ?? ".agent/scratchpad.md";
			console.log(readScratchpad(scratchpadPath));
		} catch (error) {
			logger.error(error instanceof Error ? error.message : String(error));
			process.exit(1);
		}
	});

program
	.command("cancel")
	.description("Cancel running orchestration")
	.requiredOption("-i, --issue <number>", "GitHub issue number")
	.action(() => {
		logger.warn("Cancel not yet implemented in TypeScript version");
	});

program.parse();
