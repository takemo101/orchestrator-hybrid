import type { BackendOutputStreamer } from "../core/backend-output-streamer.js";
import { exec } from "../core/exec.js";
import type { BackendResult } from "../core/types.js";
import { BaseBackend } from "./base.js";

export interface ClaudeBackendConfig {
	/**
	 * バックエンド出力ストリーマー
	 * 設定すると、stdout/stderrをリアルタイムでログファイルに書き込む
	 */
	outputStreamer?: BackendOutputStreamer;
	/**
	 * ワーキングディレクトリ
	 */
	workdir?: string;
}

export class ClaudeBackend extends BaseBackend {
	readonly name = "claude";
	private readonly outputStreamer?: BackendOutputStreamer;
	private readonly workdir?: string;

	constructor(config: ClaudeBackendConfig = {}) {
		super();
		this.outputStreamer = config.outputStreamer;
		this.workdir = config.workdir;
	}

	async execute(prompt: string): Promise<BackendResult> {
		try {
			const { stdout, exitCode } = await exec(
				"claude",
				["-p", prompt, "--allowedTools", "Edit,Write,Bash,Read,Glob,Grep"],
				{ reject: false, outputStreamer: this.outputStreamer, cwd: this.workdir },
			);

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
