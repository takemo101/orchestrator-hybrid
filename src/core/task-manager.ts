import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Issue } from "./types.js";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface TaskState {
	id: string;
	issueNumber: number;
	issueTitle: string;
	status: TaskStatus;
	currentHat: string | null;
	iteration: number;
	maxIterations: number;
	lastEvent: string | null;
	error: string | null;
	startedAt: Date | null;
	updatedAt: Date;
	completedAt: Date | null;
}

interface SerializedTaskState {
	id: string;
	issueNumber: number;
	issueTitle: string;
	status: TaskStatus;
	currentHat: string | null;
	iteration: number;
	maxIterations: number;
	lastEvent: string | null;
	error: string | null;
	startedAt: string | null;
	updatedAt: string;
	completedAt: string | null;
}

interface TaskStoreData {
	version: string;
	tasks: Record<string, SerializedTaskState>;
}

export type TaskStateCallback = (update: Partial<TaskState>) => void;

export class TaskStore {
	private readonly filePath: string;
	private tasks: Map<string, TaskState> = new Map();

	constructor(filePath = ".agent/tasks.json") {
		this.filePath = filePath;
		this.load();
	}

	private load(): void {
		if (!existsSync(this.filePath)) {
			return;
		}

		try {
			const data = JSON.parse(readFileSync(this.filePath, "utf-8")) as TaskStoreData;

			for (const [id, serialized] of Object.entries(data.tasks)) {
				this.tasks.set(id, this.deserialize(serialized));
			}
		} catch {
			this.tasks = new Map();
		}
	}

	private save(): void {
		const dir = dirname(this.filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}

		const data: TaskStoreData = {
			version: "1.0",
			tasks: Object.fromEntries(
				Array.from(this.tasks.entries()).map(([id, state]) => [id, this.serialize(state)]),
			),
		};

		writeFileSync(this.filePath, JSON.stringify(data, null, 2));
	}

	private serialize(state: TaskState): SerializedTaskState {
		return {
			...state,
			startedAt: state.startedAt?.toISOString() ?? null,
			updatedAt: state.updatedAt.toISOString(),
			completedAt: state.completedAt?.toISOString() ?? null,
		};
	}

	private deserialize(data: SerializedTaskState): TaskState {
		return {
			...data,
			startedAt: data.startedAt ? new Date(data.startedAt) : null,
			updatedAt: new Date(data.updatedAt),
			completedAt: data.completedAt ? new Date(data.completedAt) : null,
		};
	}

	get(id: string): TaskState | undefined {
		return this.tasks.get(id);
	}

	getAll(): TaskState[] {
		return Array.from(this.tasks.values());
	}

	getByStatus(status: TaskStatus): TaskState[] {
		return this.getAll().filter((t) => t.status === status);
	}

	set(state: TaskState): void {
		this.tasks.set(state.id, state);
		this.save();
	}

	update(id: string, update: Partial<TaskState>): TaskState | undefined {
		const existing = this.tasks.get(id);
		if (!existing) {
			return undefined;
		}

		const updated: TaskState = {
			...existing,
			...update,
			updatedAt: new Date(),
		};

		this.tasks.set(id, updated);
		this.save();
		return updated;
	}

	delete(id: string): boolean {
		const deleted = this.tasks.delete(id);
		if (deleted) {
			this.save();
		}
		return deleted;
	}

	clear(): void {
		this.tasks.clear();
		this.save();
	}
}

export function generateTaskId(): string {
	const timestamp = Date.now().toString(36);
	const random = Math.random().toString(36).substring(2, 6);
	return `task-${timestamp}-${random}`;
}

export function createTaskState(id: string, issue: Issue, maxIterations: number): TaskState {
	return {
		id,
		issueNumber: issue.number,
		issueTitle: issue.title,
		status: "pending",
		currentHat: null,
		iteration: 0,
		maxIterations,
		lastEvent: null,
		error: null,
		startedAt: null,
		updatedAt: new Date(),
		completedAt: null,
	};
}

export class TaskManager {
	private readonly store: TaskStore;
	private readonly runningTasks: Map<string, Promise<void>> = new Map();
	private readonly abortControllers: Map<string, AbortController> = new Map();

	constructor(store?: TaskStore) {
		this.store = store ?? new TaskStore();
	}

	getStore(): TaskStore {
		return this.store;
	}

	getTask(id: string): TaskState | undefined {
		return this.store.get(id);
	}

	getAllTasks(): TaskState[] {
		return this.store.getAll();
	}

	getRunningTasks(): TaskState[] {
		return this.store.getByStatus("running");
	}

	createTask(issue: Issue, maxIterations: number): TaskState {
		const id = generateTaskId();
		const state = createTaskState(id, issue, maxIterations);
		this.store.set(state);
		return state;
	}

	updateTask(id: string, update: Partial<TaskState>): TaskState | undefined {
		return this.store.update(id, update);
	}

	async startTask(
		id: string,
		runner: (onStateChange: TaskStateCallback, signal: AbortSignal) => Promise<void>,
	): Promise<void> {
		const task = this.store.get(id);
		if (!task) {
			throw new Error(`Task ${id} not found`);
		}

		if (task.status === "running") {
			throw new Error(`Task ${id} is already running`);
		}

		const abortController = new AbortController();
		this.abortControllers.set(id, abortController);

		this.store.update(id, {
			status: "running",
			startedAt: new Date(),
		});

		const onStateChange: TaskStateCallback = (update) => {
			this.store.update(id, update);
		};

		const taskPromise = runner(onStateChange, abortController.signal)
			.then(() => {
				const current = this.store.get(id);
				if (current?.status === "running") {
					this.store.update(id, {
						status: "completed",
						completedAt: new Date(),
					});
				}
			})
			.catch((error) => {
				const current = this.store.get(id);
				if (current?.status === "running") {
					this.store.update(id, {
						status: "failed",
						error: error instanceof Error ? error.message : String(error),
						completedAt: new Date(),
					});
				}
			})
			.finally(() => {
				this.runningTasks.delete(id);
				this.abortControllers.delete(id);
			});

		this.runningTasks.set(id, taskPromise);
	}

	cancelTask(id: string): boolean {
		const controller = this.abortControllers.get(id);
		if (!controller) {
			return false;
		}

		controller.abort();
		this.store.update(id, {
			status: "cancelled",
			completedAt: new Date(),
		});
		return true;
	}

	async waitForTask(id: string): Promise<TaskState | undefined> {
		const promise = this.runningTasks.get(id);
		if (promise) {
			await promise;
		}
		return this.store.get(id);
	}

	async waitForAll(): Promise<void> {
		await Promise.all(this.runningTasks.values());
	}

	async runParallel(
		tasks: Array<{
			issue: Issue;
			maxIterations: number;
			runner: (onStateChange: TaskStateCallback, signal: AbortSignal) => Promise<void>;
		}>,
	): Promise<TaskState[]> {
		const taskStates: TaskState[] = [];

		for (const { issue, maxIterations, runner } of tasks) {
			const state = this.createTask(issue, maxIterations);
			taskStates.push(state);

			this.startTask(state.id, runner).catch(() => {});
		}

		await this.waitForAll();

		return taskStates.map((t) => this.store.get(t.id)).filter(Boolean) as TaskState[];
	}
}
