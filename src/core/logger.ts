import chalk from "chalk";
import type { LogLevel } from "./types.js";

let verboseMode = false;
let globalTaskContext: string | null = null;

export function setVerbose(verbose: boolean): void {
	verboseMode = verbose;
}

export function setTaskContext(taskId: string | null): void {
	globalTaskContext = taskId;
}

function getTimestamp(): string {
	return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function formatPrefix(level: LogLevel, taskId?: string | null): string {
	const timestamp = chalk.gray(`[${getTimestamp()}]`);
	const taskPrefix = taskId ? chalk.magenta(`[${taskId}]`) : "";
	const levelPrefix = getLevelPrefix(level);

	return taskId ? `${timestamp} ${taskPrefix} ${levelPrefix}` : `${levelPrefix}`;
}

function getLevelPrefix(level: LogLevel): string {
	switch (level) {
		case "debug":
			return chalk.cyan("[DEBUG]");
		case "info":
			return chalk.blue("[INFO]");
		case "warn":
			return chalk.yellow("[WARN]");
		case "error":
			return chalk.red("[ERROR]");
	}
}

export function log(level: LogLevel, message: string, taskId?: string | null): void {
	const effectiveTaskId = taskId ?? globalTaskContext;
	const prefix = formatPrefix(level, effectiveTaskId);
	const output = `${prefix} ${message}`;

	if (level === "debug" && !verboseMode) {
		return;
	}

	if (level === "error") {
		console.error(output);
	} else {
		console.log(output);
	}
}

export const logger = {
	debug: (msg: string, taskId?: string | null) => log("debug", msg, taskId),
	info: (msg: string, taskId?: string | null) => log("info", msg, taskId),
	warn: (msg: string, taskId?: string | null) => log("warn", msg, taskId),
	error: (msg: string, taskId?: string | null) => log("error", msg, taskId),
	success: (msg: string, taskId?: string | null) => {
		const timestamp = chalk.gray(`[${getTimestamp()}]`);
		const taskPrefix = taskId ? chalk.magenta(`[${taskId}]`) : "";
		const prefix = taskId
			? `${timestamp} ${taskPrefix} ${chalk.green("[OK]")}`
			: `${chalk.green("[OK]")}`;
		console.log(`${prefix} ${msg}`);
	},
};

export function createTaskLogger(taskId: string) {
	return {
		debug: (msg: string) => logger.debug(msg, taskId),
		info: (msg: string) => logger.info(msg, taskId),
		warn: (msg: string) => logger.warn(msg, taskId),
		error: (msg: string) => logger.error(msg, taskId),
		success: (msg: string) => logger.success(msg, taskId),
	};
}
