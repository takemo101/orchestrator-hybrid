import type { IBackendAdapter } from "./interface";

export class ClaudeAdapter implements IBackendAdapter {
	getCommand(): string {
		return "claude";
	}

	getArgs(promptPath: string): string[] {
		return ["--print", promptPath];
	}

	getName(): string {
		return "claude";
	}
}
