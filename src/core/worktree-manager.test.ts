import { beforeEach, describe, expect, it, spyOn } from "bun:test";
import type { ProcessExecutor } from "./process-executor";
import { WorktreeManager } from "./worktree-manager";

// Mock ProcessExecutor
class MockExecutor implements ProcessExecutor {
	async exec(
		command: string[],
		_options?: unknown,
	): Promise<{ stdout: string; stderr: string; exitCode: number }> {
		if (command.includes("worktree") && command.includes("list")) {
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
		const spy = spyOn(mockExecutor, "exec");
		await manager.createWorktree("orch-test-1");
		// git worktree add ... が呼ばれることを期待
		expect(spy).toHaveBeenCalled();
	});

	it("should execute git worktree remove", async () => {
		const spy = spyOn(mockExecutor, "exec");
		await manager.removeWorktree("orch-test-1");
		// git worktree remove ... が呼ばれることを期待
		expect(spy).toHaveBeenCalled();
	});

	it("should list worktrees", async () => {
		const worktrees = await manager.listWorktrees();
		expect(worktrees).toBeArray();
	});
});
