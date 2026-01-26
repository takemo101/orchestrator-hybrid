import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { OrchTaskManager } from "./orch-task-manager.js";

const testDir = ".test-agent-orch-task";

beforeEach(async () => {
	await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("OrchTaskManager", () => {
	test("Taskを追加", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		const taskId = await manager.addTask("Add auth", 2);

		expect(taskId).toBe("task-001");

		const tasks = await manager.listTasks();
		expect(tasks).toHaveLength(1);
		expect(tasks[0].title).toBe("Add auth");
		expect(tasks[0].priority).toBe(2);
		expect(tasks[0].status).toBe("open");
	});

	test("Task状態を更新", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		const taskId = await manager.addTask("Task 1", 1);
		await manager.updateStatus(taskId, "in-progress");
		await manager.updateStatus(taskId, "closed");

		const tasks = await manager.listTasks();
		expect(tasks[0].status).toBe("closed");
	});

	test("ブロックされていないTaskを取得", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		const task1 = await manager.addTask("Task 1", 1);
		await manager.addTask("Task 2", 2, [task1]);

		const ready = await manager.getReadyTasks();
		expect(ready).toHaveLength(1);
		expect(ready[0].id).toBe(task1);
	});

	test("依存タスクが完了したらブロック解除", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		const task1 = await manager.addTask("Task 1", 1);
		await manager.addTask("Task 2", 2, [task1]);

		let ready = await manager.getReadyTasks();
		expect(ready).toHaveLength(1);
		expect(ready[0].id).toBe(task1);

		await manager.updateStatus(task1, "closed");

		ready = await manager.getReadyTasks();
		expect(ready).toHaveLength(1);
		expect(ready[0].id).toBe("task-002");
	});

	test("すべてのTaskが完了しているか確認", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		const task1 = await manager.addTask("Task 1", 1);
		const task2 = await manager.addTask("Task 2", 2);

		expect(await manager.isAllTasksCompleted()).toBe(false);

		await manager.updateStatus(task1, "closed");
		expect(await manager.isAllTasksCompleted()).toBe(false);

		await manager.updateStatus(task2, "closed");
		expect(await manager.isAllTasksCompleted()).toBe(true);
	});

	test("優先度順にソート", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		await manager.addTask("Low priority", 5);
		await manager.addTask("High priority", 1);
		await manager.addTask("Medium priority", 3);

		const tasks = await manager.listTasks();
		expect(tasks[0].priority).toBe(1);
		expect(tasks[1].priority).toBe(3);
		expect(tasks[2].priority).toBe(5);
	});

	test("Tasksが無効の場合は空配列", async () => {
		const manager = new OrchTaskManager({ enabled: false }, testDir);

		const taskId = await manager.addTask("Task 1", 1);
		expect(taskId).toBe("");

		const tasks = await manager.listTasks();
		expect(tasks).toHaveLength(0);
	});

	test("deleteTaskでclosedに更新", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		const taskId = await manager.addTask("Task 1", 1);
		await manager.deleteTask(taskId);

		const tasks = await manager.listTasks();
		expect(tasks[0].status).toBe("closed");
	});

	test("タスクが存在しない場合もisAllTasksCompletedはtrue", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);
		expect(await manager.isAllTasksCompleted()).toBe(true);
	});

	test("存在しない依存タスクは警告して無視", async () => {
		const manager = new OrchTaskManager({ enabled: true }, testDir);

		await manager.addTask("Task 1", 1, ["non-existent-task"]);

		const ready = await manager.getReadyTasks();
		expect(ready).toHaveLength(1);
	});
});
