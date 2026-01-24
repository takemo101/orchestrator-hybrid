export { type Backend, createBackend } from "./adapters/index.js";
export type {
	ProcessExecutor,
	ProcessResult,
	SpawnOptions,
} from "./core/process-executor.js";
export { loadConfig } from "./core/config.js";
export { EventBus, globalEventBus, type OrchEvent } from "./core/event.js";
export {
	buildHatPrompt,
	extractPublishedEvent,
	globalHatRegistry,
	type HatDefinition,
	HatRegistry,
} from "./core/hat.js";
export { createTaskLogger, logger, setVerbose } from "./core/logger.js";
export { runLoop, runMultipleLoops } from "./core/loop.js";
export {
	createTaskState,
	generateTaskId,
	TaskManager,
	type TaskState,
	type TaskStateCallback,
	type TaskStatus,
	TaskStore,
} from "./core/task-manager.js";
export type { Config, Hat, Issue, LoopContext } from "./core/types.js";
export { requestApproval } from "./gates/approval.js";
export {
	addIssueComment,
	fetchIssue,
	updateIssueLabel,
} from "./input/github.js";
export { generatePrompt } from "./input/prompt.js";
export {
	type CreatePROptions,
	checkForUncommittedChanges,
	createPR,
	getCurrentBranch,
	type PRResult,
} from "./output/pr.js";
