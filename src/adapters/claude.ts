import { execa } from "execa";
import type { BackendResult } from "../core/types.js";
import { BaseBackend } from "./base.js";

export class ClaudeBackend extends BaseBackend {
	readonly name = "claude";

	async execute(prompt: string): Promise<BackendResult> {
		try {
			const { stdout, exitCode } = await execa(
				"claude",
				["-p", prompt, "--allowedTools", "Edit,Write,Bash,Read,Glob,Grep"],
				{ reject: false },
			);

			return {
				output: stdout,
				exitCode: exitCode ?? 0,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				output: message,
				exitCode: 1,
			};
		}
	}
}
