import type { BackendOptions, IBackendAdapter } from "./interface";

export class PiAdapter implements IBackendAdapter {
	getCommand(): string {
		return "pi";
	}

	getArgs(promptPath: string, options?: BackendOptions): string[] {
		const args = ["-p"];
		if (options?.model) {
			args.push("--model", options.model);
		}
		args.push(`@${promptPath}`);
		return args;
	}

	getName(): string {
		return "pi";
	}
}
