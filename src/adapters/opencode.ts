import type { IBackendAdapter } from "./interface";

export class OpenCodeAdapter implements IBackendAdapter {
	getCommand(): string {
		return "opencode";
	}

	getArgs(promptPath: string): string[] {
		return ["-p", promptPath];
	}

	getName(): string {
		return "opencode";
	}
}
