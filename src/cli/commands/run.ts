/**
 * runコマンド
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";
import { loadConfig } from "../../core/config.js";
import { logger, setVerbose } from "../../core/logger.js";
import { runLoop, runMultipleLoops } from "../../core/loop.js";
import { TaskManager } from "../../core/task-manager.js";
import type { PRConfig, TasksConfig } from "../../core/types.js";
import { fetchIssue } from "../../input/github.js";
import { loadPreset } from "../utils/preset-loader.js";
import type { CommandHandler, RunCommandOptions } from "./types.js";
import { printTaskSummary } from "./status.js";

/**
 * runコマンドハンドラー
 */
export class RunCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("run")
			.description("Start orchestration loop")
			.option("-i, --issue <number>", "GitHub issue number (single)")
			.option("--issues <numbers>", "GitHub issue numbers (comma-separated for parallel)")
			.option("-b, --backend <type>", "Backend: claude, opencode")
			.option("-p, --preset <name>", "Use preset configuration (tdd, spec-driven, simple)")
			.option("-m, --max-iterations <number>", "Maximum iterations", Number.parseInt)
			.option("-a, --auto", "Auto-approve all gates")
			.option("--create-pr", "Create PR after completion")
			.option("--draft", "Create PR as draft")
			.option("--container", "Run in isolated container-use environment")
			.option("--auto-merge", "Auto-merge PR after CI passes")
			.option("--resolve-deps", "Resolve and run dependency issues first")
			.option("--ignore-deps", "Ignore issue dependencies")
			.option("--report [path]", "Generate execution report (default: .agent/report.md)")
			.option("--record-session <file>", "Record session to JSONL file")
			.option("-c, --config <path>", "Config file path")
			.option("-v, --verbose", "Verbose output")
			.action(async (options: RunCommandOptions) => {
				try {
					await this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(options: RunCommandOptions): Promise<void> {
		if (options.verbose) {
			setVerbose(true);
		}

		if (!options.issue && !options.issues) {
			throw new Error("Either --issue or --issues is required");
		}

		let config: ReturnType<typeof loadConfig>;
		if (options.preset) {
			logger.info(`Using preset: ${options.preset}`);
			config = loadPreset(options.preset);
		} else {
			config = loadConfig(options.config);
		}

		if (options.backend) {
			config.backend.type = options.backend as "claude" | "opencode" | "gemini" | "container";
		}

		// PR設定を構築（CLIオプションが設定ファイルより優先）
		const prConfig: PRConfig = {
			auto_merge: options.autoMerge ?? config.pr?.auto_merge ?? false,
			merge_method: config.pr?.merge_method ?? "squash",
			delete_branch: config.pr?.delete_branch ?? true,
			ci_timeout_secs: config.pr?.ci_timeout_secs ?? 600,
		};

		// 依存関係設定を構築（CLIオプションが設定ファイルより優先）
		const depConfig = {
			resolveDeps: options.resolveDeps ?? config.dependency?.resolve ?? false,
			ignoreDeps: options.ignoreDeps ?? config.dependency?.ignore ?? false,
		};

		if (options.issues) {
			await this.handleMultipleIssues(options, config, prConfig, depConfig);
		} else {
			await this.handleSingleIssue(options, config, prConfig, depConfig);
		}
	}

	private async handleMultipleIssues(
		options: RunCommandOptions,
		config: ReturnType<typeof loadConfig>,
		prConfig: PRConfig,
		depConfig: { resolveDeps: boolean; ignoreDeps: boolean },
	): Promise<void> {
		const issueNumbers = (options.issues ?? "")
			.split(",")
			.map((n: string) => Number.parseInt(n.trim(), 10))
			.filter((n: number) => !Number.isNaN(n));

		if (issueNumbers.length === 0) {
			throw new Error("No valid issue numbers provided");
		}

		logger.info(`Starting parallel execution for issues: ${issueNumbers.join(", ")}`);

		const taskManager = new TaskManager();

		await runMultipleLoops(
			{
				issueNumbers,
				config,
				autoMode: options.auto ?? false,
				maxIterations: options.maxIterations,
				createPR: options.createPr ?? false,
				draftPR: options.draft ?? false,
				useContainer: options.container ?? false,
				generateReport: options.report !== undefined,
				preset: options.preset,
				prConfig,
				resolveDeps: depConfig.resolveDeps,
				ignoreDeps: depConfig.ignoreDeps,
			},
			taskManager,
		);

		printTaskSummary(taskManager.getAllTasks());
	}

	private async handleSingleIssue(
		options: RunCommandOptions,
		config: ReturnType<typeof loadConfig>,
		prConfig: PRConfig,
		depConfig: { resolveDeps: boolean; ignoreDeps: boolean },
	): Promise<void> {
		const issueNumber = Number.parseInt(options.issue ?? "0", 10);
		const issue = await fetchIssue(issueNumber);
		const maxIterations = options.maxIterations ?? config.loop.max_iterations;

		const taskManager = new TaskManager();
		const taskState = taskManager.createTask(issue, maxIterations);

		await taskManager.startTask(taskState.id, async (onStateChange, signal) => {
			await runLoop({
				issueNumber,
				config,
				autoMode: options.auto ?? false,
				maxIterations,
				createPR: options.createPr ?? false,
				draftPR: options.draft ?? false,
				useContainer: options.container ?? false,
				generateReport: options.report !== undefined,
				reportPath:
					typeof options.report === "string" ? options.report : `.agent/${taskState.id}/report.md`,
				preset: options.preset,
				taskId: taskState.id,
				prConfig,
				resolveDeps: depConfig.resolveDeps,
				ignoreDeps: depConfig.ignoreDeps,
				recordSessionPath: options.recordSession,
				onStateChange,
				signal,
			});
		});

		await taskManager.waitForTask(taskState.id);

		const finalState = taskManager.getTask(taskState.id);
		if (finalState) {
			printTaskSummary([finalState]);
		}
	}
}

export const runCommand = new RunCommand();
