import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import {
	createTaskState,
	generateTaskId,
	TaskManager,
	TaskStore,
} from "./task-manager.js";
import type { Issue } from "./types.js";

const TEST_STORE_PATH = ".test-tasks/tasks.json";

const mockIssue: Issue = {
	number: 42,
	title: "Test Issue",
	body: "Test body",
	labels: ["bug"],
	state: "open",
};

describe("task-manager", () => {
	beforeEach(() => {
		if (existsSync(".test-tasks")) {
			rmSync(".test-tasks", { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(".test-tasks")) {
			rmSync(".test-tasks", { recursive: true });
		}
	});

	describe("generateTaskId", () => {
		it("should generate unique task IDs", () => {
			const id1 = generateTaskId();
			const id2 = generateTaskId();

			expect(id1).toMatch(/^task-[a-z0-9]+-[a-z0-9]+$/);
			expect(id2).toMatch(/^task-[a-z0-9]+-[a-z0-9]+$/);
			expect(id1).not.toBe(id2);
		});
	});

	describe("createTaskState", () => {
		it("should create initial task state", () => {
			const state = createTaskState("task-123", mockIssue, 10);

			expect(state.id).toBe("task-123");
			expect(state.issueNumber).toBe(42);
			expect(state.issueTitle).toBe("Test Issue");
			expect(state.status).toBe("pending");
			expect(state.currentHat).toBeNull();
			expect(state.iteration).toBe(0);
			expect(state.maxIterations).toBe(10);
			expect(state.lastEvent).toBeNull();
			expect(state.error).toBeNull();
			expect(state.startedAt).toBeNull();
			expect(state.updatedAt).toBeInstanceOf(Date);
			expect(state.completedAt).toBeNull();
		});
	});

	describe("TaskStore", () => {
		it("should create empty store when file does not exist", () => {
			const store = new TaskStore(TEST_STORE_PATH);
			expect(store.getAll()).toHaveLength(0);
		});

		it("should persist and load tasks", () => {
			const store1 = new TaskStore(TEST_STORE_PATH);
			const state = createTaskState("task-123", mockIssue, 10);
			store1.set(state);

			const store2 = new TaskStore(TEST_STORE_PATH);
			const loaded = store2.get("task-123");

			expect(loaded).toBeDefined();
			expect(loaded?.id).toBe("task-123");
			expect(loaded?.issueNumber).toBe(42);
		});

		it("should update task state", () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const state = createTaskState("task-123", mockIssue, 10);
			store.set(state);

			const updated = store.update("task-123", {
				status: "running",
				iteration: 5,
			});

			expect(updated?.status).toBe("running");
			expect(updated?.iteration).toBe(5);
		});

		it("should return undefined when updating non-existent task", () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const result = store.update("non-existent", { status: "running" });
			expect(result).toBeUndefined();
		});

		it("should delete task", () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const state = createTaskState("task-123", mockIssue, 10);
			store.set(state);

			expect(store.delete("task-123")).toBe(true);
			expect(store.get("task-123")).toBeUndefined();
		});

		it("should filter tasks by status", () => {
			const store = new TaskStore(TEST_STORE_PATH);

			const state1 = createTaskState("task-1", mockIssue, 10);
			state1.status = "running";
			store.set(state1);

			const state2 = createTaskState("task-2", mockIssue, 10);
			state2.status = "completed";
			store.set(state2);

			const state3 = createTaskState("task-3", mockIssue, 10);
			state3.status = "running";
			store.set(state3);

			const running = store.getByStatus("running");
			expect(running).toHaveLength(2);
			expect(running.map((t) => t.id)).toContain("task-1");
			expect(running.map((t) => t.id)).toContain("task-3");
		});

		it("should clear all tasks", () => {
			const store = new TaskStore(TEST_STORE_PATH);
			store.set(createTaskState("task-1", mockIssue, 10));
			store.set(createTaskState("task-2", mockIssue, 10));

			store.clear();
			expect(store.getAll()).toHaveLength(0);
		});
	});

	describe("TaskManager", () => {
		it("should create tasks", () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const task = manager.createTask(mockIssue, 10);

			expect(task.id).toMatch(/^task-/);
			expect(task.issueNumber).toBe(42);
			expect(task.status).toBe("pending");
		});

		it("should start and complete tasks", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const task = manager.createTask(mockIssue, 10);

			await manager.startTask(task.id, async (onStateChange) => {
				onStateChange({ iteration: 1 });
				onStateChange({ iteration: 2 });
			});

			const finalState = manager.getTask(task.id);
			expect(finalState?.status).toBe("completed");
		});

		it("should handle task failures", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const task = manager.createTask(mockIssue, 10);

			await manager.startTask(task.id, async () => {
				throw new Error("Test error");
			});

			await manager.waitForTask(task.id);

			const finalState = manager.getTask(task.id);
			expect(finalState?.status).toBe("failed");
			expect(finalState?.error).toBe("Test error");
		});

		it("should cancel tasks", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const task = manager.createTask(mockIssue, 10);

			const runPromise = manager.startTask(
				task.id,
				async (_onStateChange, signal) => {
					await new Promise((resolve, reject) => {
						const timeout = setTimeout(resolve, 10000);
						signal.addEventListener("abort", () => {
							clearTimeout(timeout);
							reject(new Error("Cancelled"));
						});
					});
				},
			);

			await new Promise((resolve) => setTimeout(resolve, 50));

			const cancelled = manager.cancelTask(task.id);
			expect(cancelled).toBe(true);

			await runPromise.catch(() => {});

			const finalState = manager.getTask(task.id);
			expect(finalState?.status).toBe("cancelled");
		});

		it("should throw when starting non-existent task", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			await expect(
				manager.startTask("non-existent", async () => {}),
			).rejects.toThrow("Task non-existent not found");
		});

		it("should throw when starting already running task", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const task = manager.createTask(mockIssue, 10);

			manager.startTask(task.id, async () => {
				await new Promise((resolve) => setTimeout(resolve, 1000));
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			await expect(manager.startTask(task.id, async () => {})).rejects.toThrow(
				"already running",
			);
		});

		it("should run multiple tasks in parallel", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const issue1 = { ...mockIssue, number: 1, title: "Issue 1" };
			const issue2 = { ...mockIssue, number: 2, title: "Issue 2" };

			const executionOrder: number[] = [];

			const results = await manager.runParallel([
				{
					issue: issue1,
					maxIterations: 10,
					runner: async (onStateChange) => {
						executionOrder.push(1);
						onStateChange({ iteration: 1 });
						await new Promise((resolve) => setTimeout(resolve, 50));
						executionOrder.push(1);
					},
				},
				{
					issue: issue2,
					maxIterations: 10,
					runner: async (onStateChange) => {
						executionOrder.push(2);
						onStateChange({ iteration: 1 });
						await new Promise((resolve) => setTimeout(resolve, 50));
						executionOrder.push(2);
					},
				},
			]);

			expect(results).toHaveLength(2);
			expect(results.every((r) => r.status === "completed")).toBe(true);
			expect(executionOrder).toContain(1);
			expect(executionOrder).toContain(2);
		});

		it("should get running tasks", async () => {
			const store = new TaskStore(TEST_STORE_PATH);
			const manager = new TaskManager(store);

			const task1 = manager.createTask(mockIssue, 10);
			const task2 = manager.createTask({ ...mockIssue, number: 43 }, 10);

			manager.startTask(task1.id, async () => {
				await new Promise((resolve) => setTimeout(resolve, 500));
			});

			await new Promise((resolve) => setTimeout(resolve, 50));

			const running = manager.getRunningTasks();
			expect(running).toHaveLength(1);
			expect(running[0].id).toBe(task1.id);

			manager.cancelTask(task1.id);
		});
	});
});
