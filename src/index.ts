export { type Backend, createBackend } from "./adapters/index.js";
export { loadConfig } from "./core/config.js";
export { logger, setVerbose } from "./core/logger.js";
export { runLoop } from "./core/loop.js";
export type { Config, Hat, Issue, LoopContext } from "./core/types.js";
export { requestApproval } from "./gates/approval.js";
export {
	addIssueComment,
	fetchIssue,
	updateIssueLabel,
} from "./input/github.js";
export { generatePrompt } from "./input/prompt.js";
