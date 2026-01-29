import type { BackendOptions, IBackendAdapter } from "./interface";

export class ClaudeAdapter implements IBackendAdapter {
	getCommand(): string {
		return "claude";
	}

	getArgs(promptPath: string, options?: BackendOptions): string[] {
		const args = ["--print"];
		if (options?.model) {
			args.push("--model", options.model);
		}
		args.push(promptPath);
		return args;
	}

	getName(): string {
		return "claude";
	}
}
