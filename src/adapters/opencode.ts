import { exec } from "../core/exec.js";
import type { BackendResult } from "../core/types.js";
import { BaseBackend } from "./base.js";

export class OpenCodeBackend extends BaseBackend {
	readonly name = "opencode";

	async execute(prompt: string): Promise<BackendResult> {
		try {
			const { stdout, exitCode } = await exec("opencode", ["run", prompt], {
				reject: false,
			});

			return {
				output: stdout,
				exitCode,
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
