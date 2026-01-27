import type { BackendOutputStreamer } from "./backend-output-streamer.js";

export interface ExecResult {
	stdout: string;
	exitCode: number;
}

export interface ExecOptions {
	reject?: boolean;
	/**
	 * バックエンド出力ストリーマー
	 * 設定すると、stdout/stderrをリアルタイムでログファイルに書き込む
	 */
	outputStreamer?: BackendOutputStreamer;
	/**
	 * ワーキングディレクトリ
	 * 指定するとこのディレクトリでコマンドを実行する
	 */
	cwd?: string;
}

export async function exec(
	cmd: string,
	args: string[],
	options: ExecOptions = {},
): Promise<ExecResult> {
	const { reject = true, outputStreamer, cwd } = options;

	const proc = Bun.spawn([cmd, ...args], {
		stdout: "pipe",
		stderr: "pipe",
		cwd,
	});

	// ストリーミングが有効な場合、リアルタイムでログに書き込む
	if (outputStreamer && proc.stdout && proc.stderr) {
		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		// stdout をストリーミング
		const stdoutReader = proc.stdout.getReader();
		const readStdout = async () => {
			while (true) {
				const { done, value } = await stdoutReader.read();
				if (done) break;
				if (value) {
					stdoutChunks.push(Buffer.from(value));
					outputStreamer.writeStdout(Buffer.from(value));
				}
			}
		};

		// stderr をストリーミング
		const stderrReader = proc.stderr.getReader();
		const readStderr = async () => {
			while (true) {
				const { done, value } = await stderrReader.read();
				if (done) break;
				if (value) {
					stderrChunks.push(Buffer.from(value));
					outputStreamer.writeStderr(Buffer.from(value));
				}
			}
		};

		// 並列で読み取り
		await Promise.all([readStdout(), readStderr()]);

		const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
		const exitCode = await proc.exited;

		if (reject && exitCode !== 0) {
			const stderr = Buffer.concat(stderrChunks).toString("utf-8");
			throw new Error(`Command failed with exit code ${exitCode}: ${stderr || stdout}`);
		}

		return { stdout, exitCode };
	}

	// ストリーミングなしの従来の動作
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;

	if (reject && exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`Command failed with exit code ${exitCode}: ${stderr || stdout}`);
	}

	return { stdout, exitCode };
}
