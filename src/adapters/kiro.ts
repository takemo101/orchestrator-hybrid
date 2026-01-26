import { BunProcessExecutor } from "../core/bun-process-executor.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import type { BackendResult } from "../core/types.js";
import type { Backend } from "./base.js";

export interface KiroAdapterConfig {
	agent: string;
}

export class KiroAdapter implements Backend {
	readonly name = "kiro";
	private readonly executor: ProcessExecutor;

	constructor(
		private config: KiroAdapterConfig,
		executor: ProcessExecutor = new BunProcessExecutor(),
	) {
		this.executor = executor;
	}

	async execute(prompt: string): Promise<BackendResult> {
		const result = await this.executor.spawn("kiro-cli", ["--agent", this.config.agent, prompt]);

		if (result.exitCode !== 0) {
			throw new Error(`Kiro実行失敗: ${result.stderr || "Unknown error"}`);
		}

		return {
			output: result.stdout,
			exitCode: result.exitCode,
		};
	}
}
