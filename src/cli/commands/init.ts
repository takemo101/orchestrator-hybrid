/**
 * initコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import { existsSync, writeFileSync } from "node:fs";
import type { Command } from "commander";
import { loadConfig } from "../../core/config.js";
import { logger } from "../../core/logger.js";
import { IssueStatusLabelManager } from "../../output/issue-status-label-manager.js";
import { AVAILABLE_PRESETS, loadPreset, readPresetContent } from "../utils/preset-loader.js";
import type { CommandHandler, InitCommandOptions } from "./types.js";

/**
 * initコマンドハンドラー
 */
export class InitCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("init")
			.description("Initialize configuration file")
			.option("-p, --preset <name>", "Use preset configuration")
			.option("--list-presets", "List available presets")
			.option("-f, --force", "Overwrite existing config")
			.option("--labels", "Create status labels in repository")
			.action(async (options: InitCommandOptions) => {
				try {
					await this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(options: InitCommandOptions): Promise<void> {
		if (options.listPresets) {
			this.listPresets();
			return;
		}

		if (options.labels) {
			await this.initializeLabels();
			return;
		}

		await this.initializeConfig(options);
	}

	private listPresets(): void {
		console.log("");
		logger.info("Available presets:");
		console.log("");

		for (const preset of AVAILABLE_PRESETS) {
			console.log(`  ${preset.name.padEnd(15)} ${preset.description}`);
		}

		console.log("");
		console.log("Usage: orch init --preset <name>");
		console.log("       orch run --issue <n> --preset <name>");
		console.log("");
	}

	private async initializeLabels(): Promise<void> {
		const config = loadConfig();
		const labelManager = new IssueStatusLabelManager({
			enabled: true,
			labelPrefix: config.state?.label_prefix ?? "orch",
		});
		await labelManager.initializeLabels();
	}

	private async initializeConfig(options: InitCommandOptions): Promise<void> {
		const configPath = "orch.yml";

		if (existsSync(configPath) && !options.force) {
			throw new Error(`${configPath} already exists. Use --force to overwrite.`);
		}

		let content: string;

		if (options.preset) {
			loadPreset(options.preset); // バリデーション
			content = readPresetContent(options.preset);
			logger.info(`Initialized with preset: ${options.preset}`);
		} else {
			content = this.getDefaultConfig();
			logger.info("Initialized with default configuration");
		}

		writeFileSync(configPath, content);
		logger.success(`Created ${configPath}`);
	}

	private getDefaultConfig(): string {
		return `version: "1.0"

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
	}
}

export const initCommand = new InitCommand();
