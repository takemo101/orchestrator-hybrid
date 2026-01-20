import chalk from "chalk";
import type { LogLevel } from "./types.js";

let verboseMode = false;

export function setVerbose(verbose: boolean): void {
	verboseMode = verbose;
}

export function log(level: LogLevel, message: string): void {
	const prefix = getPrefix(level);
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

function getPrefix(level: LogLevel): string {
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

export const logger = {
	debug: (msg: string) => log("debug", msg),
	info: (msg: string) => log("info", msg),
	warn: (msg: string) => log("warn", msg),
	error: (msg: string) => log("error", msg),
	success: (msg: string) => console.log(`${chalk.green("[OK]")} ${msg}`),
};
