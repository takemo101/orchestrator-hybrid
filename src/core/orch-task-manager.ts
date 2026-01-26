import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "./logger.js";
import type { TasksConfig } from "./types.js";

export type OrchTaskStatus = "open" | "in-progress" | "closed";

export interface OrchTask {
	id: string;
	title: string;
	priority: number;
	status: OrchTaskStatus;
	blocked_by: string[];
	created_at: string;
	updated_at: string;
}

export class OrchTaskManager {
	private readonly config: TasksConfig;
	private readonly tasksPath: string;

	constructor(config: TasksConfig, baseDir: string) {
		this.config = config;
		this.tasksPath = join(baseDir, "tasks.jsonl");
	}

	async loadTasks(): Promise<OrchTask[]> {
		if (!this.config.enabled) {
			return [];
		}

		try {
			const content = await readFile(this.tasksPath, "utf-8");
			return this.parseTasks(content);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			logger.warn("tasks.jsonlの読み込みに失敗しました。空のtasksとして扱います。");
			return [];
		}
	}

	async addTask(title: string, priority = 3, blockedBy: string[] = []): Promise<string> {
		if (!this.config.enabled) {
			logger.warn("Tasksは無効です。");
			return "";
		}

		const tasks = await this.loadTasks();
		const taskId = this.generateTaskId(tasks);
		const now = new Date().toISOString();

		const task: OrchTask = {
			id: taskId,
			title,
			priority,
			status: "open",
			blocked_by: blockedBy,
			created_at: now,
			updated_at: now,
		};

		await this.appendTask(task);
		logger.info(`Task追加: ${taskId} - ${title}`);
		return taskId;
	}

	async getReadyTasks(): Promise<OrchTask[]> {
		const tasks = await this.loadTasks();
		return tasks.filter((task) => task.status === "open" && !this.isBlocked(task, tasks));
	}

	async updateStatus(taskId: string, status: OrchTaskStatus): Promise<void> {
		const tasks = await this.loadTasks();
		const task = tasks.find((t) => t.id === taskId);

		if (!task) {
			logger.warn(`Task ${taskId} が見つかりません`);
			return;
		}

		const updatedTask: OrchTask = {
			...task,
			status,
			updated_at: new Date().toISOString(),
		};

		await this.appendTask(updatedTask);
		logger.info(`Task状態更新: ${taskId} -> ${status}`);
	}

	async listTasks(): Promise<OrchTask[]> {
		return this.loadTasks();
	}

	async deleteTask(taskId: string): Promise<void> {
		await this.updateStatus(taskId, "closed");
	}

	async isAllTasksCompleted(): Promise<boolean> {
		const tasks = await this.loadTasks();
		if (tasks.length === 0) {
			return true;
		}
		return tasks.every((task) => task.status === "closed");
	}

	private parseTasks(content: string): OrchTask[] {
		const lines = content
			.trim()
			.split("\n")
			.filter((line) => line);
		const taskMap = new Map<string, OrchTask>();

		for (const line of lines) {
			try {
				const task = JSON.parse(line) as OrchTask;
				taskMap.set(task.id, task);
			} catch {
				logger.warn(`不正なJSONL行をスキップ: ${line.substring(0, 50)}...`);
			}
		}

		return Array.from(taskMap.values()).sort((a, b) => a.priority - b.priority);
	}

	private async appendTask(task: OrchTask): Promise<void> {
		await mkdir(dirname(this.tasksPath), { recursive: true });
		const line = `${JSON.stringify(task)}\n`;
		await appendFile(this.tasksPath, line);
	}

	private generateTaskId(tasks: OrchTask[]): string {
		let maxNum = 0;
		for (const task of tasks) {
			const match = task.id.match(/^task-(\d+)$/);
			if (match) {
				const num = Number.parseInt(match[1], 10);
				if (num > maxNum) {
					maxNum = num;
				}
			}
		}
		const nextNum = maxNum + 1;
		return `task-${String(nextNum).padStart(3, "0")}`;
	}

	private isBlocked(task: OrchTask, allTasks: OrchTask[]): boolean {
		if (task.blocked_by.length === 0) {
			return false;
		}

		for (const depId of task.blocked_by) {
			const depTask = allTasks.find((t) => t.id === depId);
			if (!depTask) {
				logger.warn(`依存タスク ${depId} が存在しません。依存関係を無視します。`);
				continue;
			}
			if (depTask.status !== "closed") {
				return true;
			}
		}

		return false;
	}
}
