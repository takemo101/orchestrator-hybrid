#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import { loadConfig } from "./core/config.js";
import { EventBus } from "./core/event.js";
import { logger, setVerbose } from "./core/logger.js";
import { runLoop } from "./core/loop.js";
import { readScratchpad } from "./core/scratchpad.js";
import { fetchIssue } from "./input/github.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "..", "presets");

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
		"-p, --preset <name>",
		"Use preset configuration (tdd, spec-driven, simple)",
	)
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

			let config;

			if (options.preset) {
				config = loadPreset(options.preset);
				logger.info(`Using preset: ${options.preset}`);
			} else {
				config = loadConfig(options.config);
			}

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
	.command("events")
	.description("Show event history")
	.action(() => {
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
	});

program
	.command("init")
	.description("Initialize configuration file")
	.option("-p, --preset <name>", "Use preset configuration")
	.option("--list-presets", "List available presets")
	.option("-f, --force", "Overwrite existing config")
	.action((options) => {
		if (options.listPresets) {
			listPresets();
			return;
		}

		const configPath = "orch.yml";

		if (existsSync(configPath) && !options.force) {
			logger.error(`${configPath} already exists. Use --force to overwrite.`);
			process.exit(1);
		}

		let content: string;

		if (options.preset) {
			const preset = loadPreset(options.preset);
			content = readFileSync(getPresetPath(options.preset), "utf-8");
			logger.info(`Initialized with preset: ${options.preset}`);
		} else {
			content = `version: "1.0"

backend:
  type: claude

loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"

gates:
  after_plan: true
  after_implementation: false
  before_pr: true

state:
  use_github_labels: true
  use_scratchpad: true
`;
			logger.info("Initialized with default configuration");
		}

		writeFileSync(configPath, content);
		logger.success(`Created ${configPath}`);
	});

program
	.command("cancel")
	.description("Cancel running orchestration")
	.requiredOption("-i, --issue <number>", "GitHub issue number")
	.action(() => {
		logger.warn("Cancel not yet implemented");
	});

program.parse();

function loadPreset(name: string) {
	const presetPath = getPresetPath(name);

	if (!existsSync(presetPath)) {
		throw new Error(
			`Preset not found: ${name}. Use --list-presets to see available presets.`,
		);
	}

	const content = readFileSync(presetPath, "utf-8");
	return parseYaml(content);
}

function getPresetPath(name: string): string {
	const candidates = [
		join(PRESETS_DIR, `${name}.yml`),
		join(PRESETS_DIR, `${name}.yaml`),
		join(process.cwd(), "presets", `${name}.yml`),
		join(process.cwd(), "presets", `${name}.yaml`),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return candidates[0];
}

function listPresets(): void {
	console.log("");
	logger.info("Available presets:");
	console.log("");

	const presets = [
		{ name: "simple", desc: "Basic loop without hats (default)" },
		{
			name: "tdd",
			desc: "Test-Driven Development (Tester → Implementer → Refactorer)",
		},
		{
			name: "spec-driven",
			desc: "Specification-driven (Planner → Builder → Reviewer)",
		},
	];

	for (const preset of presets) {
		console.log(`  ${preset.name.padEnd(15)} ${preset.desc}`);
	}

	console.log("");
	console.log("Usage: orch init --preset <name>");
	console.log("       orch run --issue <n> --preset <name>");
	console.log("");
}
