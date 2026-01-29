#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { Command } from "commander";

import { ClaudeAdapter } from "./adapters/claude";
import type { IBackendAdapter } from "./adapters/interface";
import { OpenCodeAdapter } from "./adapters/opencode";
import { createSessionManager, type SessionManagerType } from "./adapters/session";
import type { Session } from "./adapters/session/interface";
import { loadConfigWithHats, PresetNotFoundError } from "./core/config";
import { CircularDependencyError, DependencyResolver } from "./core/dependency";
import { EventBus } from "./core/event";
import { HatSystem } from "./core/hat";
import { LogMonitor } from "./core/log-monitor";
import { type IterationContext, LoopEngine, type LoopResult } from "./core/loop";
import type { HatDefinition, OrchestratorConfig, WorktreeConfig } from "./core/types";
import {
	WorktreeCreateError,
	type WorktreeInfo,
	WorktreeManager,
	WorktreeNotFoundError,
	WorktreeRunningError,
} from "./core/worktree";
import { ApprovalGate, ApprovalGateError } from "./gates/approval";
import { fetchIssue } from "./input/github";
import { type HatContext, PromptGenerator } from "./input/prompt";
import { PRCreateError, PRCreator } from "./output/pr";
import { type IssueStatus, StatusLabelManager } from "./output/status-label";

function getBackendAdapter(backendType: string): IBackendAdapter {
	if (backendType === "opencode") {
		return new OpenCodeAdapter();
	}
	return new ClaudeAdapter();
}

/**
 * デフォルトのコマンドエグゼキュータ（gh CLI経由）
 */
const defaultCommandExecutor = {
	async exec(
		command: string,
		args: string[],
	): Promise<{ exitCode: number; stdout: string; stderr: string }> {
		const proc = Bun.spawn([command, ...args], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		return { exitCode, stdout, stderr };
	},
};

/**
 * ステータスラベルを安全に更新する（エラーでも処理を続行）
 */
async function safeUpdateStatus(
	statusManager: StatusLabelManager | undefined,
	issueNumber: number,
	status: IssueStatus,
): Promise<void> {
	if (!statusManager) return;
	try {
		await statusManager.syncStatus(issueNumber, status);
	} catch (error) {
		console.warn(`Warning: Failed to update status label to '${status}': ${error}`);
	}
}

function mergeOptionsWithConfig(
	cliOptions: Record<string, unknown>,
	config: OrchestratorConfig,
): {
	backend: string;
	auto: boolean;
	createPr: boolean;
	draft: boolean;
	maxIterations: number;
	preset: string;
	sessionManager: SessionManagerType;
	resolveDeps: boolean;
	useWorktree: boolean;
} {
	const worktreeCliOption = cliOptions.worktree as boolean | undefined;
	const useWorktree = worktreeCliOption !== false && config.worktree.enabled;

	return {
		backend: (cliOptions.backend as string | undefined) ?? config.backend,
		auto: (cliOptions.auto as boolean | undefined) ?? config.auto,
		createPr: (cliOptions.createPr as boolean | undefined) ?? config.create_pr,
		draft: (cliOptions.draft as boolean | undefined) ?? false,
		maxIterations: (cliOptions.maxIterations as number | undefined) ?? config.max_iterations,
		preset: (cliOptions.preset as string | undefined) ?? config.preset,
		sessionManager: ((cliOptions.sessionManager as string | undefined) ??
			config.session.manager) as SessionManagerType,
		resolveDeps: (cliOptions.resolveDeps as boolean | undefined) ?? false,
		useWorktree,
	};
}

function formatSessionTable(sessions: Session[]): string {
	if (sessions.length === 0) {
		return "No active sessions.";
	}

	const header = "ID\t\tType\tStatus\t\tCommand\t\tStarted";
	const separator = "-".repeat(80);
	const rows = sessions.map((s) => {
		const elapsed = Math.floor((Date.now() - s.startTime.getTime()) / 1000);
		const minutes = Math.floor(elapsed / 60);
		const seconds = elapsed % 60;
		const duration = `${minutes}m ${seconds}s ago`;
		return `${s.id}\t${s.type}\t${s.status}\t\t${s.command}\t\t${duration}`;
	});

	return [header, separator, ...rows].join("\n");
}

/**
 * Worktree一覧をテーブル形式でフォーマットする
 */
function formatWorktreeTable(worktrees: WorktreeInfo[]): string {
	const header = "Issue\tBranch\t\t\t\tPath\t\t\t\tStatus";
	const separator = "-".repeat(80);
	const rows = worktrees.map((wt) => {
		return `#${wt.issueNumber}\t${wt.branch}\t\t${wt.path}\t\t${wt.status}`;
	});

	return [header, separator, ...rows].join("\n");
}

function createWorktreeManager(worktreeConfig?: WorktreeConfig): WorktreeManager {
	const config: WorktreeConfig = worktreeConfig ?? {
		enabled: true,
		base_dir: ".worktrees",
		copy_files: [".env"],
	};

	const exec = async (
		args: string[],
	): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
		const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
		const [stdout, stderr] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const exitCode = await proc.exited;
		return { stdout, stderr, exitCode };
	};

	const fileOps = {
		writeFile: async (path: string, content: string): Promise<void> => {
			await Bun.write(path, content);
		},
		fileExists: async (path: string): Promise<boolean> => {
			return Bun.file(path).exists();
		},
		readFile: async (path: string): Promise<string> => {
			return Bun.file(path).text();
		},
	};

	return new WorktreeManager(config, exec, fileOps);
}

/**
 * 現在のGitブランチ名を取得する
 * @returns ブランチ名。取得失敗時はundefined
 */
async function getCurrentBranch(): Promise<string | undefined> {
	try {
		const proc = Bun.spawn(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode === 0) {
			return stdout.trim();
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/**
 * 単一Issueの実行処理
 */
interface ExecuteIssueOptions {
	backend: IBackendAdapter;
	sessionManager: Awaited<ReturnType<typeof createSessionManager>>;
	maxIterations: number;
	createPr: boolean;
	draft: boolean;
	hatSystem?: HatSystem;
	statusLabelManager?: StatusLabelManager;
}

async function executeIssue(
	issueNumber: number,
	options: ExecuteIssueOptions,
): Promise<{ success: boolean; iterations: number }> {
	const { backend, sessionManager, maxIterations, createPr, draft, hatSystem, statusLabelManager } =
		options;

	console.log(`\n${"=".repeat(60)}`);
	console.log(`Executing Issue #${issueNumber}...`);
	console.log(`${"=".repeat(60)}`);

	await safeUpdateStatus(statusLabelManager, issueNumber, "running");

	const issue = await fetchIssue(issueNumber).catch((error) => {
		console.error(`Failed to fetch Issue #${issueNumber}: ${error}`);
		return null;
	});

	if (!issue) {
		await safeUpdateStatus(statusLabelManager, issueNumber, "failed");
		return { success: false, iterations: 0 };
	}

	console.log(`Generating prompt for: ${issue.title}`);

	const promptGenerator = new PromptGenerator();
	const sessionId = String(issueNumber);

	// HatSystem有効時は初期イベントを設定
	const hasHats = hatSystem && hatSystem.getAllHats().length > 0;
	const eventBus = new EventBus();
	const loopEngine = new LoopEngine(eventBus, hasHats ? hatSystem : undefined);

	const waitForSessionEnd = async (): Promise<string> => {
		const pollInterval = 2000;
		while (await sessionManager.isRunning(sessionId)) {
			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}
		return await sessionManager.getOutput(sessionId);
	};

	const issueAgentDir = join(".agent", `issue-${issueNumber}`);

	const runner = async (ctx: IterationContext): Promise<string> => {
		const hatContext: HatContext | undefined = ctx.activeHat
			? {
					hatName: ctx.activeHat.name,
					hatInstructions: ctx.activeHat.instructions,
				}
			: undefined;

		const prompt = promptGenerator.generate(issue, hatContext);
		mkdirSync(issueAgentDir, { recursive: true });
		const promptPath = resolve(issueAgentDir, "PROMPT.md");
		writeFileSync(promptPath, prompt);

		if (ctx.iteration > 1 || ctx.activeHat) {
			const hatInfo = ctx.activeHat ? ` [${ctx.activeHat.name}]` : "";
			console.log(`\nIteration ${ctx.iteration}${hatInfo}: Starting session...`);
		} else {
			console.log(`Starting session ${sessionId} with ${backend.getName()} backend...`);
		}

		await sessionManager.create(sessionId, backend.getCommand(), backend.getArgs(promptPath));

		console.log(`Waiting for AI to complete...`);
		return await waitForSessionEnd();
	};

	let result: LoopResult;
	try {
		result = await loopEngine.run(runner, {
			maxIterations,
			completionKeyword: "LOOP_COMPLETE",
			initialEvent: hasHats ? "task.start" : undefined,
		});

		if (result.success) {
			console.log(`\nIssue #${issueNumber} completed after ${result.iterations} iterations.`);

			await safeUpdateStatus(statusLabelManager, issueNumber, "completed");

			// PR自動作成
			if (createPr) {
				console.log("\nCreating PR...");
				const prCreator = new PRCreator();
				const branchName = await getCurrentBranch();

				if (!branchName) {
					console.error("Failed to get current branch name. Skipping PR creation.");
				} else {
					try {
						const prResult = await prCreator.create(issueNumber, branchName, issue.title, {
							draft,
						});
						console.log(`PR created: ${prResult.url}`);
						await safeUpdateStatus(statusLabelManager, issueNumber, "pr-created");
					} catch (error) {
						if (error instanceof PRCreateError) {
							if (error.message === "No changes to create PR") {
								console.log("No changes to create PR. Skipping.");
							} else {
								console.error(`Failed to create PR: ${error.message}`);
							}
						} else {
							console.error(`Failed to create PR: ${error}`);
						}
					}
				}
			}
		} else {
			await safeUpdateStatus(statusLabelManager, issueNumber, "failed");
		}

		return { success: result.success, iterations: result.iterations };
	} catch (error) {
		console.error(`Loop terminated for Issue #${issueNumber}: ${error}`);
		await sessionManager.kill(sessionId).catch(() => {});
		await safeUpdateStatus(statusLabelManager, issueNumber, "failed");
		return { success: false, iterations: 0 };
	}
}

export function createProgram(): Command {
	const program = new Command();

	program
		.name("orch")
		.description("AI agent orchestrator - GitHub Issue driven automation")
		.version("3.0.0");

	program
		.command("run")
		.description("Execute an Issue with AI agent")
		.requiredOption("-i, --issue <number>", "GitHub Issue number", Number.parseInt)
		.option("-c, --config <path>", "Config file path")
		.option("-a, --auto", "Auto-approve all gates")
		.option("--create-pr", "Create PR after completion")
		.option("--draft", "Create PR as draft")
		.option("-p, --preset <name>", "Preset to use (simple, tdd)")
		.option("-b, --backend <type>", "Backend type (claude, opencode)")
		.option("-m, --max-iterations <number>", "Max loop iterations", Number.parseInt)
		.option("--resolve-deps", "Resolve dependent issues first", false)
		.option(
			"--ignore-deps",
			"Ignore dependency resolution (mutually exclusive with --resolve-deps)",
			false,
		)
		.option("--no-worktree", "Disable worktree isolation")
		.option("--no-labels", "Disable status label updates")
		.option("--session-manager <type>", "Session manager (auto, native, tmux, zellij)")
		.action(async (cliOptions) => {
			// --resolve-deps と --ignore-deps の排他チェック
			if (cliOptions.resolveDeps && cliOptions.ignoreDeps) {
				console.error("Error: --resolve-deps and --ignore-deps are mutually exclusive.");
				process.exit(1);
			}

			// プリセットを考慮して設定を読み込み
			let config: OrchestratorConfig;
			let hats: Record<string, HatDefinition>;
			try {
				const result = loadConfigWithHats(cliOptions.config, cliOptions.preset);
				config = result.config;
				hats = result.hats;
			} catch (error) {
				if (error instanceof PresetNotFoundError) {
					console.error(`Error: Preset '${error.presetName}' not found.`);
					console.error("Available presets: simple, tdd");
					process.exit(1);
				}
				throw error;
			}

			const options = mergeOptionsWithConfig(cliOptions, config);
			const issueNumber = cliOptions.issue;

			// HatSystemの初期化（Hat定義がある場合のみ）
			const hatSystem = Object.keys(hats).length > 0 ? new HatSystem(hats) : undefined;

			// StatusLabelManager の初期化（--no-labels で無効化可能）
			const labelsEnabled = cliOptions.labels !== false;
			const statusLabelManager = labelsEnabled
				? new StatusLabelManager(defaultCommandExecutor, "orch")
				: undefined;

			// 依存関係解決
			if (options.resolveDeps) {
				console.log(`Resolving dependencies for Issue #${issueNumber}...`);

				const dependencyResolver = new DependencyResolver({
					fetchIssue,
				});

				let executionOrder: number[];
				try {
					executionOrder = await dependencyResolver.resolveOrder(issueNumber);
				} catch (error) {
					if (error instanceof CircularDependencyError) {
						console.error(`Error: ${error.message}`);
						console.error("Please review the dependency relationships in your Issues.");
						process.exit(1);
					}
					throw error;
				}

				if (executionOrder.length > 1) {
					console.log(`Execution order: ${executionOrder.map((n) => `#${n}`).join(" -> ")}`);
				}

				const backend = getBackendAdapter(options.backend);
				const sessionManager = await createSessionManager(options.sessionManager);

				// 依存Issueを順次実行
				for (const depIssueNumber of executionOrder) {
					const result = await executeIssue(depIssueNumber, {
						backend,
						sessionManager,
						maxIterations: options.maxIterations,
						createPr: options.createPr,
						draft: options.draft,
						hatSystem,
						statusLabelManager,
					});

					if (!result.success && depIssueNumber !== issueNumber) {
						console.error(`\nDependency Issue #${depIssueNumber} failed. Stopping execution.`);
						process.exit(1);
					}
				}

				console.log(`\n${"=".repeat(60)}`);
				console.log("All issues completed successfully!");
				console.log(`${"=".repeat(60)}`);
				return;
			}

			// 通常の単一Issue実行（依存解決なし）

			// 承認ゲートを初期化
			const approvalGate = new ApprovalGate({ auto: options.auto });

			console.log(`Fetching Issue #${issueNumber}...`);
			const issue = await fetchIssue(issueNumber).catch((error) => {
				console.error(`Failed to fetch Issue #${issueNumber}: ${error}`);
				process.exit(1);
			});

			console.log(`Generating prompt for: ${issue.title}`);
			if (options.preset !== "simple") {
				console.log(`Using preset: ${options.preset}`);
			}
			if (hatSystem) {
				const hatCount = hatSystem.getAllHats().length;
				console.log(`Hat system enabled with ${hatCount} hat(s)`);
			}

			// Pre-loop承認ゲート
			const promptGenerator = new PromptGenerator();
			const initialPrompt = promptGenerator.generate(issue);

			try {
				const preLoopContext = `Issue #${issueNumber}: ${issue.title}\n\nPrompt preview:\n${initialPrompt.substring(0, 500)}${initialPrompt.length > 500 ? "..." : ""}`;
				const preLoopResult = await approvalGate.ask("pre-loop", preLoopContext);
				if (!preLoopResult.approved) {
					console.log("Pre-loop gate rejected. Aborting execution.");
					process.exit(0);
				}
				if (!preLoopResult.auto) {
					console.log("Pre-loop gate approved. Starting execution...");
				}
			} catch (error) {
				if (error instanceof ApprovalGateError) {
					console.error(`Approval gate error: ${error.message}`);
					process.exit(1);
				}
				throw error;
			}

			const backend = getBackendAdapter(options.backend);
			const sessionManager = await createSessionManager(options.sessionManager);
			const sessionId = String(issueNumber);

			let workingDir = process.cwd();
			if (options.useWorktree) {
				console.log(`Creating worktree for Issue #${issueNumber}...`);
				const worktreeManager = createWorktreeManager(config.worktree);
				try {
					const worktreeInfo = await worktreeManager.create(issueNumber);
					workingDir = worktreeInfo.path;
					console.log(`Worktree created: ${worktreeInfo.path} (branch: ${worktreeInfo.branch})`);
				} catch (error) {
					if (error instanceof WorktreeCreateError) {
						console.error(`Failed to create worktree: ${error.message}`);
						process.exit(1);
					}
					throw error;
				}
			}

			console.log(
				`Starting session ${sessionId} with ${backend.getName()} backend (${options.sessionManager})...`,
			);

			await safeUpdateStatus(statusLabelManager, issueNumber, "running");

			// HatSystem有効時は初期イベントを設定
			const hasHats = hatSystem && hatSystem.getAllHats().length > 0;
			const eventBus = new EventBus();
			const loopEngine = new LoopEngine(eventBus, hasHats ? hatSystem : undefined);

			const waitForSessionEnd = async (): Promise<string> => {
				const pollInterval = 2000;
				while (await sessionManager.isRunning(sessionId)) {
					await new Promise((resolve) => setTimeout(resolve, pollInterval));
				}
				return await sessionManager.getOutput(sessionId);
			};

			const issueAgentDir = join(workingDir, ".agent", `issue-${issueNumber}`);

			const runner = async (ctx: IterationContext): Promise<string> => {
				const hatContext: HatContext | undefined = ctx.activeHat
					? {
							hatName: ctx.activeHat.name,
							hatInstructions: ctx.activeHat.instructions,
						}
					: undefined;

				const prompt = promptGenerator.generate(issue, hatContext);
				mkdirSync(issueAgentDir, { recursive: true });
				const promptPath = resolve(issueAgentDir, "PROMPT.md");
				writeFileSync(promptPath, prompt);

				const sessionOptions = { cwd: workingDir };

				if (ctx.iteration > 1) {
					const hatInfo = ctx.activeHat ? ` [${ctx.activeHat.name}]` : "";
					console.log(`\nIteration ${ctx.iteration}${hatInfo}: Restarting session...`);
					await sessionManager.create(
						sessionId,
						backend.getCommand(),
						backend.getArgs(promptPath),
						sessionOptions,
					);
				} else {
					const session = await sessionManager.create(
						sessionId,
						backend.getCommand(),
						backend.getArgs(promptPath),
						sessionOptions,
					);
					console.log(`Session created: ${session.id} (${session.type})`);
				}

				console.log(`Waiting for AI to complete...`);
				return await waitForSessionEnd();
			};

			let result: LoopResult;
			try {
				result = await loopEngine.run(runner, {
					maxIterations: options.maxIterations,
					completionKeyword: "LOOP_COMPLETE",
					initialEvent: hasHats ? "task.start" : undefined,
				});

				if (result.success) {
					console.log(`\nCompleted after ${result.iterations} iterations.`);

					await safeUpdateStatus(statusLabelManager, issueNumber, "completed");

					// Post-completion承認ゲート
					try {
						const postCompletionContext = `Issue #${issueNumber}: ${issue.title}\n\nLoop completed successfully after ${result.iterations} iteration(s).`;
						const postCompletionResult = await approvalGate.ask(
							"post-completion",
							postCompletionContext,
						);
						if (!postCompletionResult.approved) {
							console.log("Post-completion gate rejected. Stopping without PR creation.");
							return;
						}
						if (!postCompletionResult.auto) {
							console.log("Post-completion gate approved.");
						}
					} catch (error) {
						if (error instanceof ApprovalGateError) {
							console.error(`Approval gate error: ${error.message}`);
							return;
						}
						throw error;
					}

					// PR自動作成
					if (options.createPr) {
						const branchName = await getCurrentBranch();

						if (!branchName) {
							console.error("Failed to get current branch name. Skipping PR creation.");
						} else {
							// Before-PR承認ゲート
							try {
								const beforePrContext = `Issue #${issueNumber}: ${issue.title}\n\nBranch: ${branchName}\nDraft: ${options.draft ? "Yes" : "No"}`;
								const beforePrResult = await approvalGate.ask("before-pr", beforePrContext);
								if (!beforePrResult.approved) {
									console.log("Before-PR gate rejected. Skipping PR creation.");
									return;
								}
								if (!beforePrResult.auto) {
									console.log("Before-PR gate approved. Creating PR...");
								} else {
									console.log("\nCreating PR...");
								}
							} catch (error) {
								if (error instanceof ApprovalGateError) {
									console.error(`Approval gate error: ${error.message}`);
									return;
								}
								throw error;
							}

							try {
								const prCreator = new PRCreator();
								const prResult = await prCreator.create(issueNumber, branchName, issue.title, {
									draft: options.draft,
								});
								console.log(`PR created: ${prResult.url}`);
								await safeUpdateStatus(statusLabelManager, issueNumber, "pr-created");
							} catch (error) {
								if (error instanceof PRCreateError) {
									if (error.message === "No changes to create PR") {
										console.log("No changes to create PR. Skipping.");
									} else {
										console.error(`Failed to create PR: ${error.message}`);
									}
								} else {
									console.error(`Failed to create PR: ${error}`);
								}
							}
						}
					}
				} else {
					await safeUpdateStatus(statusLabelManager, issueNumber, "failed");
				}
			} catch (error) {
				console.error(`Loop terminated: ${error}`);
				await sessionManager.kill(sessionId).catch(() => {});
				await safeUpdateStatus(statusLabelManager, issueNumber, "failed");
			}
		});

	program
		.command("status")
		.description("Show current execution status")
		.option("-i, --issue <number>", "Show status for specific Issue", Number.parseInt)
		.action(async (options) => {
			const sessionManager = await createSessionManager("auto");

			if (options.issue) {
				const sessionId = String(options.issue);
				const running = await sessionManager.isRunning(sessionId);
				console.log(`Issue #${options.issue}: ${running ? "running" : "not running"}`);
			} else {
				const sessions = await sessionManager.list();
				console.log(formatSessionTable(sessions));
			}
		});

	program
		.command("logs")
		.description("Show execution logs")
		.argument("[issue]", "Issue number (optional)", Number.parseInt)
		.option("-f, --follow", "Follow log output in realtime", false)
		.option("-n, --lines <number>", "Number of lines to show", Number.parseInt, 100)
		.action(async (issue, options) => {
			const sessionManager = await createSessionManager("auto");
			const logMonitor = new LogMonitor(sessionManager);

			let sessionId: string;
			if (issue) {
				sessionId = String(issue);
			} else {
				const sessions = await sessionManager.list();
				if (sessions.length === 0) {
					console.log("No active sessions.");
					return;
				}
				sessionId = sessions[0].id;
				console.log(`Showing logs for session: ${sessionId}`);
			}

			process.on("SIGINT", () => {
				logMonitor.stop();
				process.exit(0);
			});

			await logMonitor.showLogs(sessionId, {
				follow: options.follow,
				lines: options.lines,
			});
		});

	program
		.command("sessions")
		.description("List all active sessions")
		.action(async () => {
			const sessionManager = await createSessionManager("auto");
			const sessions = await sessionManager.list();
			console.log(formatSessionTable(sessions));
		});

	program
		.command("attach")
		.description("Attach to a running session")
		.argument("<issue>", "Issue number to attach", Number.parseInt)
		.action(async (issue) => {
			const sessionManager = await createSessionManager("auto");
			const sessionId = String(issue);

			const running = await sessionManager.isRunning(sessionId);
			if (!running) {
				console.error(`Session for Issue #${issue} is not running.`);
				process.exit(1);
			}

			console.log(`Attaching to Issue #${issue}...`);
			await sessionManager.attach(sessionId);
		});

	program
		.command("kill")
		.description("Kill a running session")
		.argument("<issue>", "Issue number to kill", Number.parseInt)
		.action(async (issue) => {
			const sessionManager = await createSessionManager("auto");
			const sessionId = String(issue);

			const running = await sessionManager.isRunning(sessionId);
			if (!running) {
				console.log(`Session for Issue #${issue} is not running.`);
				return;
			}

			await sessionManager.kill(sessionId);
			console.log(`Session for Issue #${issue} killed.`);
		});

	program
		.command("cancel")
		.description("Cancel running sessions")
		.option("-t, --task <id>", "Cancel specific task by session ID")
		.option("-a, --all", "Cancel all running sessions")
		.action(async (cliOptions) => {
			if (!cliOptions.task && !cliOptions.all) {
				console.error("Error: Specify --task <id> or --all");
				process.exit(1);
			}

			const sessionManager = await createSessionManager("auto");
			const sessions = await sessionManager.list();
			const runningSessions = sessions.filter((s) => s.status === "running");

			if (runningSessions.length === 0) {
				console.log("No running sessions found.");
				return;
			}

			if (cliOptions.task) {
				const session = runningSessions.find((s) => s.id === cliOptions.task);
				if (!session) {
					console.error(`Session ${cliOptions.task} not found or not running.`);
					process.exit(1);
				}
				await sessionManager.kill(cliOptions.task);
				console.log(`Session ${cliOptions.task} cancelled.`);
			} else if (cliOptions.all) {
				console.log(`Cancelling ${runningSessions.length} session(s)...`);
				for (const session of runningSessions) {
					await sessionManager.kill(session.id);
					console.log(`  Cancelled: ${session.id}`);
				}
				console.log("All sessions cancelled.");
			}
		});

	program
		.command("worktrees")
		.description("List all worktrees")
		.action(async () => {
			const worktreeManager = createWorktreeManager();
			const worktrees = await worktreeManager.list();

			if (worktrees.length === 0) {
				console.log("No worktrees found.");
				return;
			}

			console.log(formatWorktreeTable(worktrees));
		});

	const worktreeCommand = program.command("worktree").description("Worktree management");

	worktreeCommand
		.command("create")
		.description("Create a worktree for an Issue")
		.argument("<issue>", "Issue number", Number.parseInt)
		.action(async (issue) => {
			console.log(`Creating worktree for Issue #${issue}...`);

			const worktreeManager = createWorktreeManager();
			try {
				const info = await worktreeManager.create(issue);
				console.log(`Worktree created:`);
				console.log(`  Issue:  #${info.issueNumber}`);
				console.log(`  Branch: ${info.branch}`);
				console.log(`  Path:   ${info.path}`);
			} catch (error) {
				console.error(`Failed to create worktree: ${error}`);
				process.exit(1);
			}
		});

	worktreeCommand
		.command("remove")
		.description("Remove a worktree")
		.argument("<issue>", "Issue number", Number.parseInt)
		.option("-f, --force", "Force removal even if not merged", false)
		.action(async (issue, _options) => {
			console.log(`Removing worktree for Issue #${issue}...`);

			const worktreeManager = createWorktreeManager();
			try {
				await worktreeManager.remove(issue);
				console.log(`Worktree for Issue #${issue} removed.`);
			} catch (error) {
				if (error instanceof WorktreeRunningError) {
					console.error(`Error: Issue #${issue} is currently running. Stop it first.`);
					process.exit(1);
				}
				if (error instanceof WorktreeNotFoundError) {
					console.error(`Error: Worktree for Issue #${issue} not found.`);
					process.exit(1);
				}
				console.error(`Failed to remove worktree: ${error}`);
				process.exit(1);
			}
		});

	program
		.command("init")
		.description("Initialize configuration file")
		.option("-p, --preset <name>", "Initialize with preset (simple, tdd)")
		.option("--labels", "Create status labels in repository")
		.action(async (cliOptions) => {
			console.log("Initializing...");

			if (cliOptions.labels) {
				console.log("Creating status labels in repository...");
				const statusLabelManager = new StatusLabelManager(defaultCommandExecutor, "orch");
				try {
					await statusLabelManager.ensureLabelsExist();
					console.log("Status labels created successfully.");
				} catch (error) {
					console.error(`Failed to create status labels: ${error}`);
					process.exit(1);
				}
			}
		});

	return program;
}

if (import.meta.main) {
	const program = createProgram();
	program.parse();
}
