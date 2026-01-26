import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { ProcessExecutor, ProcessResult } from "./process-executor";
import { WorktreeManager } from "./worktree-manager";

class MockExecutor implements ProcessExecutor {
	async spawn(command: string, args: string[]): Promise<ProcessResult> {
		if (command === "git" && args.includes("worktree") && args.includes("list")) {
			return { stdout: "/path/to/worktree  deadbeef [branch-name]\n", stderr: "", exitCode: 0 };
		}
		return { stdout: "", stderr: "", exitCode: 0 };
	}
}

describe("WorktreeManager", () => {
	let manager: WorktreeManager;
	let mockExecutor: MockExecutor;

	beforeEach(() => {
		mockExecutor = new MockExecutor();
		manager = new WorktreeManager("/tmp/base", mockExecutor);
	});

	it("should execute git worktree add", async () => {
		const spy = spyOn(mockExecutor, "spawn");
		await manager.createWorktree("orch-test-1");
		expect(spy).toHaveBeenCalled();
	});

	it("should execute git worktree remove", async () => {
		const spy = spyOn(mockExecutor, "spawn");
		await manager.removeWorktree("orch-test-1");
		expect(spy).toHaveBeenCalled();
	});

	it("should list worktrees", async () => {
		const worktrees = await manager.listWorktrees();
		expect(worktrees).toBeArray();
	});
});
