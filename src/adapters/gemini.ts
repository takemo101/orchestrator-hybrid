import { BunProcessExecutor } from "../core/bun-process-executor.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import type { BackendResult } from "../core/types.js";
import type { Backend } from "./base.js";

export class GeminiAdapter implements Backend {
	readonly name = "gemini";
	private readonly executor: ProcessExecutor;

	constructor(executor: ProcessExecutor = new BunProcessExecutor()) {
		this.executor = executor;
	}

	async execute(prompt: string): Promise<BackendResult> {
		const result = await this.executor.spawn("gemini", [prompt]);

		if (result.exitCode !== 0) {
			throw new Error(`Gemini実行失敗: ${result.stderr || "Unknown error"}`);
		}

		return {
			output: result.stdout,
			exitCode: result.exitCode,
		};
	}
}
