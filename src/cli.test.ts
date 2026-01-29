import { describe, expect, it } from "bun:test";
import type { Command } from "commander";

async function createTestProgram(): Promise<Command> {
	const { createProgram } = await import("./cli");
	return createProgram();
}

describe("CLI Commands", () => {
	describe("orch run", () => {
		it("should register run command with --issue option", async () => {
			const program = await createTestProgram();
			const runCmd = program.commands.find((cmd) => cmd.name() === "run");

			expect(runCmd).toBeDefined();
			expect(runCmd?.description()).toContain("Issue");
		});

		it("should have required options: --issue, --auto, --create-pr, --backend, --preset", async () => {
			const program = await createTestProgram();
			const runCmd = program.commands.find((cmd) => cmd.name() === "run");

			expect(runCmd).toBeDefined();

			const optionNames = runCmd?.options.map((opt) => opt.long ?? opt.short) ?? [];

			expect(optionNames).toContain("--issue");
			expect(optionNames).toContain("--auto");
			expect(optionNames).toContain("--create-pr");
			expect(optionNames).toContain("--backend");
			expect(optionNames).toContain("--preset");
		});

		it("should have --resolve-deps option for dependency resolution", async () => {
			const program = await createTestProgram();
			const runCmd = program.commands.find((cmd) => cmd.name() === "run");

			expect(runCmd).toBeDefined();

			const optionNames = runCmd?.options.map((opt) => opt.long ?? opt.short) ?? [];
			expect(optionNames).toContain("--resolve-deps");
		});

		it("should have --ignore-deps option for ignoring dependencies", async () => {
			const program = await createTestProgram();
			const runCmd = program.commands.find((cmd) => cmd.name() === "run");

			expect(runCmd).toBeDefined();

			const optionNames = runCmd?.options.map((opt) => opt.long ?? opt.short) ?? [];
			expect(optionNames).toContain("--ignore-deps");
		});
	});

	describe("orch status", () => {
		it("should register status command", async () => {
			const program = await createTestProgram();
			const statusCmd = program.commands.find((cmd) => cmd.name() === "status");

			expect(statusCmd).toBeDefined();
		});
	});

	describe("orch logs", () => {
		it("should register logs command with --follow option", async () => {
			const program = await createTestProgram();
			const logsCmd = program.commands.find((cmd) => cmd.name() === "logs");

			expect(logsCmd).toBeDefined();

			const optionNames = logsCmd?.options.map((opt) => opt.long ?? opt.short) ?? [];
			expect(optionNames).toContain("--follow");
		});
	});

	describe("orch sessions", () => {
		it("should register sessions command", async () => {
			const program = await createTestProgram();
			const sessionsCmd = program.commands.find((cmd) => cmd.name() === "sessions");

			expect(sessionsCmd).toBeDefined();
		});
	});

	describe("orch attach", () => {
		it("should register attach command with issue argument", async () => {
			const program = await createTestProgram();
			const attachCmd = program.commands.find((cmd) => cmd.name() === "attach");

			expect(attachCmd).toBeDefined();
		});
	});

	describe("orch kill", () => {
		it("should register kill command with issue argument", async () => {
			const program = await createTestProgram();
			const killCmd = program.commands.find((cmd) => cmd.name() === "kill");

			expect(killCmd).toBeDefined();
		});
	});

	describe("orch worktrees", () => {
		it("should register worktrees command", async () => {
			const program = await createTestProgram();
			const worktreesCmd = program.commands.find((cmd) => cmd.name() === "worktrees");

			expect(worktreesCmd).toBeDefined();
		});
	});

	describe("orch worktree remove", () => {
		it("should register worktree command with remove subcommand", async () => {
			const program = await createTestProgram();
			const worktreeCmd = program.commands.find((cmd) => cmd.name() === "worktree");

			expect(worktreeCmd).toBeDefined();

			const removeCmd = worktreeCmd?.commands.find((cmd) => cmd.name() === "remove");
			expect(removeCmd).toBeDefined();
		});
	});

	describe("orch init", () => {
		it("should register init command with --preset option", async () => {
			const program = await createTestProgram();
			const initCmd = program.commands.find((cmd) => cmd.name() === "init");

			expect(initCmd).toBeDefined();

			const optionNames = initCmd?.options.map((opt) => opt.long ?? opt.short) ?? [];
			expect(optionNames).toContain("--preset");
		});

		it("should have --labels option for creating status labels", async () => {
			const program = await createTestProgram();
			const initCmd = program.commands.find((cmd) => cmd.name() === "init");

			expect(initCmd).toBeDefined();

			const optionNames = initCmd?.options.map((opt) => opt.long ?? opt.short) ?? [];
			expect(optionNames).toContain("--labels");
		});
	});
});
