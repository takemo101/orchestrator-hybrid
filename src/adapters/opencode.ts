import type { IBackendAdapter } from "./interface";

export class OpenCodeAdapter implements IBackendAdapter {
	getCommand(): string {
		return "opencode";
	}

	getArgs(promptPath: string): string[] {
		return ["run", "--file", promptPath, "--", "Execute the task in the attached file"];
	}

	getName(): string {
		return "opencode";
	}
}
