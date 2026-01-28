#!/usr/bin/env bun
import { Command } from "commander";

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
			console.log(`Running Issue #${options.issue}...`);
		});

	program
		.command("status")
		.description("Show current execution status")
		.option("-i, --issue <number>", "Show status for specific Issue", Number.parseInt)
		.action(async (options) => {
			console.log("Status:", options.issue ? `Issue #${options.issue}` : "all");
		});

	program
		.command("logs")
		.description("Show execution logs")
		.argument("[issue]", "Issue number (optional)", Number.parseInt)
		.option("-f, --follow", "Follow log output in realtime", false)
		.option("-n, --lines <number>", "Number of lines to show", Number.parseInt, 100)
		.action(async (issue, _options) => {
			console.log(`Logs for ${issue ? `Issue #${issue}` : "current session"}`);
		});

	program
		.command("sessions")
		.description("List all active sessions")
		.action(async () => {
			console.log("Active sessions:");
		});

	program
		.command("attach")
		.description("Attach to a running session")
		.argument("<issue>", "Issue number to attach", Number.parseInt)
		.action(async (issue) => {
			console.log(`Attaching to Issue #${issue}...`);
		});

	program
		.command("kill")
		.description("Kill a running session")
		.argument("<issue>", "Issue number to kill", Number.parseInt)
		.action(async (issue) => {
			console.log(`Killing session for Issue #${issue}...`);
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
