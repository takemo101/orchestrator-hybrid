#!/usr/bin/env bun
import { mkdirSync, writeFileSync } from "node:fs";
import { Command } from "commander";

import { ClaudeAdapter } from "./adapters/claude";
import type { IBackendAdapter } from "./adapters/interface";
import { OpenCodeAdapter } from "./adapters/opencode";
import { createSessionManager, type SessionManagerType } from "./adapters/session";
import type { Session } from "./adapters/session/interface";
import { LogMonitor } from "./core/log-monitor";
import { LoopEngine, type LoopResult } from "./core/loop";
import { fetchIssue } from "./input/github";
import { PromptGenerator } from "./input/prompt";

function getBackendAdapter(backendType: string): IBackendAdapter {
	if (backendType === "opencode") {
		return new OpenCodeAdapter();
	}
	return new ClaudeAdapter();
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
		.option("-a, --auto", "Auto-approve all gates", false)
		.option("--create-pr", "Create PR after completion", false)
		.option("-p, --preset <name>", "Preset to use (simple, tdd)", "simple")
		.option("-b, --backend <type>", "Backend type (claude, opencode)", "claude")
		.option("-m, --max-iterations <number>", "Max loop iterations", Number.parseInt, 100)
		.option("--resolve-deps", "Resolve dependent issues first", false)
		.option("--no-worktree", "Disable worktree isolation", false)
		.option("--session-manager <type>", "Session manager (auto, native, tmux, zellij)", "auto")
		.action(async (options) => {
			const issueNumber = options.issue;
			const sessionManagerType = options.sessionManager as SessionManagerType;

			console.log(`Fetching Issue #${issueNumber}...`);
			const issue = await fetchIssue(issueNumber).catch((error) => {
				console.error(`Failed to fetch Issue #${issueNumber}: ${error}`);
				process.exit(1);
			});

			console.log(`Generating prompt for: ${issue.title}`);
			const promptGenerator = new PromptGenerator();
			const prompt = promptGenerator.generate(issue);

			mkdirSync(".agent", { recursive: true });
			const promptPath = ".agent/PROMPT.md";
			writeFileSync(promptPath, prompt);

			const backend = getBackendAdapter(options.backend);
			const sessionManager = await createSessionManager(sessionManagerType);
			const sessionId = `orch-${issueNumber}`;

			console.log(
				`Starting session ${sessionId} with ${backend.getName()} backend (${sessionManagerType})...`,
			);

			const session = await sessionManager.create(
				sessionId,
				backend.getCommand(),
				backend.getArgs(promptPath),
			);

			console.log(`Session created: ${session.id} (${session.type})`);

			const loopEngine = new LoopEngine();

			const waitForSessionEnd = async (): Promise<string> => {
				const pollInterval = 2000;
				while (await sessionManager.isRunning(sessionId)) {
					await new Promise((resolve) => setTimeout(resolve, pollInterval));
				}
				return await sessionManager.getOutput(sessionId);
			};

			const runner = async (iteration: number): Promise<string> => {
				if (iteration > 1) {
					console.log(`\nIteration ${iteration}: Restarting session...`);
					await sessionManager.create(sessionId, backend.getCommand(), backend.getArgs(promptPath));
				}

				console.log(`Waiting for AI to complete...`);
				return await waitForSessionEnd();
			};

			let result: LoopResult;
			try {
				result = await loopEngine.run(runner, {
					maxIterations: options.maxIterations,
					completionKeyword: "LOOP_COMPLETE",
				});

				if (result.success) {
					console.log(`\nCompleted after ${result.iterations} iterations.`);
				}
			} catch (error) {
				console.error(`Loop terminated: ${error}`);
				await sessionManager.kill(sessionId).catch(() => {});
			}
		});

	program
		.command("status")
		.description("Show current execution status")
		.option("-i, --issue <number>", "Show status for specific Issue", Number.parseInt)
		.action(async (options) => {
			const sessionManager = await createSessionManager("auto");

			if (options.issue) {
				const sessionId = `orch-${options.issue}`;
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
				sessionId = `orch-${issue}`;
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
			const sessionId = `orch-${issue}`;

			const running = await sessionManager.isRunning(sessionId);
			if (!running) {
				console.error(`Session ${sessionId} is not running.`);
				process.exit(1);
			}

			console.log(`Attaching to ${sessionId}...`);
			await sessionManager.attach(sessionId);
		});

	program
		.command("kill")
		.description("Kill a running session")
		.argument("<issue>", "Issue number to kill", Number.parseInt)
		.action(async (issue) => {
			const sessionManager = await createSessionManager("auto");
			const sessionId = `orch-${issue}`;

			const running = await sessionManager.isRunning(sessionId);
			if (!running) {
				console.log(`Session ${sessionId} is not running.`);
				return;
			}

			await sessionManager.kill(sessionId);
			console.log(`Session ${sessionId} killed.`);
		});

	program
		.command("worktrees")
		.description("List all worktrees")
		.action(async () => {
			console.log("Worktrees:");
		});

	const worktreeCommand = program.command("worktree").description("Worktree management");

	worktreeCommand
		.command("remove")
		.description("Remove a worktree")
		.argument("<issue>", "Issue number", Number.parseInt)
		.option("-f, --force", "Force removal even if not merged", false)
		.action(async (issue, _options) => {
			console.log(`Removing worktree for Issue #${issue}...`);
		});

	program
		.command("init")
		.description("Initialize configuration file")
		.option("-p, --preset <name>", "Initialize with preset (simple, tdd)")
		.option("--labels", "Create status labels in repository")
		.action(async (_options) => {
			console.log("Initializing...");
		});

	return program;
}

if (import.meta.main) {
	const program = createProgram();
	program.parse();
}
