import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { TaskStore } from "./core/task-manager.js";

describe("cli - single issue task management", () => {
	const testDir = ".test-cli-tasks";
	const tasksPath = `${testDir}/tasks.json`;

	beforeEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
		mkdirSync(testDir, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true });
		}
	});

	describe("handleSingleIssue should use TaskManager", () => {
		test("単一Issue実行時にTaskStoreにタスクが記録される", async () => {
			const store = new TaskStore(tasksPath);

			const mockIssue = {
				number: 42,
				title: "Test Issue",
				body: "Test body",
				labels: [],
			};

			const taskState = {
				id: "task-test-123",
				issueNumber: mockIssue.number,
				issueTitle: mockIssue.title,
				status: "running" as const,
				currentHat: null,
				iteration: 1,
				maxIterations: 100,
				lastEvent: null,
				error: null,
				startedAt: new Date(),
				updatedAt: new Date(),
				completedAt: null,
			};

			store.set(taskState);

			const runningTasks = store.getByStatus("running");
			expect(runningTasks.length).toBe(1);
			expect(runningTasks[0].issueNumber).toBe(42);
		});

		test("TaskStoreに記録されたタスクがstatus表示で取得できる", () => {
			const store = new TaskStore(tasksPath);

			store.set({
				id: "task-abc",
				issueNumber: 123,
				issueTitle: "Running Task",
				status: "running",
				currentHat: null,
				iteration: 5,
				maxIterations: 100,
				lastEvent: null,
				error: null,
				startedAt: new Date(),
				updatedAt: new Date(),
				completedAt: null,
			});

			const store2 = new TaskStore(tasksPath);
			const tasks = store2.getByStatus("running");

			expect(tasks.length).toBe(1);
			expect(tasks[0].id).toBe("task-abc");
			expect(tasks[0].issueNumber).toBe(123);
			expect(tasks[0].iteration).toBe(5);
		});

		test("タスク完了時にstatusがcompletedに更新される", () => {
			const store = new TaskStore(tasksPath);

			store.set({
				id: "task-xyz",
				issueNumber: 456,
				issueTitle: "Completing Task",
				status: "running",
				currentHat: null,
				iteration: 10,
				maxIterations: 100,
				lastEvent: null,
				error: null,
				startedAt: new Date(),
				updatedAt: new Date(),
				completedAt: null,
			});

			store.update("task-xyz", {
				status: "completed",
				completedAt: new Date(),
			});

			const completedTasks = store.getByStatus("completed");
			expect(completedTasks.length).toBe(1);
			expect(completedTasks[0].id).toBe("task-xyz");

			const runningTasks = store.getByStatus("running");
			expect(runningTasks.length).toBe(0);
		});

		test("iteration更新がリアルタイムで反映される", () => {
			const store = new TaskStore(tasksPath);

			store.set({
				id: "task-iter",
				issueNumber: 789,
				issueTitle: "Iterating Task",
				status: "running",
				currentHat: "tester",
				iteration: 1,
				maxIterations: 100,
				lastEvent: "task.start",
				error: null,
				startedAt: new Date(),
				updatedAt: new Date(),
				completedAt: null,
			});

			for (let i = 2; i <= 5; i++) {
				store.update("task-iter", {
					iteration: i,
					lastEvent: `iteration.${i}`,
				});
			}

			const store2 = new TaskStore(tasksPath);
			const task = store2.get("task-iter");

			expect(task).toBeDefined();
			expect(task?.iteration).toBe(5);
			expect(task?.lastEvent).toBe("iteration.5");
		});
	});
});
