/**
 * BunProcessExecutor - Bun.spawnを使用したProcessExecutor実装
 *
 * @module
 */

import type { FileSink, Subprocess } from "bun";
import type {
	ProcessExecutor,
	ProcessResult,
	SpawnOptions,
} from "./process-executor.js";

/**
 * Bun.spawnを使用したProcessExecutor実装
 *
 * @example
 * ```typescript
 * const executor = new BunProcessExecutor();
 * const result = await executor.spawn("echo", ["hello"], {
 *   timeout: 5000,
 * });
 * console.log(result.stdout); // "hello\n"
 * ```
 */
export class BunProcessExecutor implements ProcessExecutor {
	/**
	 * コマンドを実行する
	 *
	 * @param command 実行するコマンド
	 * @param args コマンド引数の配列
	 * @param options 実行オプション
	 * @returns 実行結果のPromise
	 */
	async spawn(
		command: string,
		args: string[],
		options: SpawnOptions = {},
	): Promise<ProcessResult> {
		let proc: Subprocess<"pipe", "pipe", "pipe">;

		// 1. Bun.spawnを呼び出し
		try {
			proc = Bun.spawn([command, ...args], {
				cwd: options.cwd,
				env: options.env,
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			});
		} catch (error) {
			// コマンドが見つからない場合などはエラーを返す
			return {
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
				exitCode: 127, // Command not found
			};
		}

		// 2. タイムアウト処理を設定
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		if (options.timeout) {
			timeoutId = this.setupTimeout(proc, options.timeout);
		}

		// 3. 標準入力にデータを書き込む
		if (options.stdin) {
			await this.writeStdin(proc.stdin, options.stdin);
		} else {
			// stdinが不要な場合は閉じる
			proc.stdin.end();
		}

		// 4. 実行完了を待機
		try {
			const [stdout, stderr, exitCode] = await Promise.all([
				options.stdout === "inherit"
					? Promise.resolve("")
					: new Response(proc.stdout).text(),
				options.stderr === "inherit"
					? Promise.resolve("")
					: new Response(proc.stderr).text(),
				proc.exited,
			]);

			// 5. タイムアウトタイマーをクリア
			if (timeoutId) {
				clearTimeout(timeoutId);
			}

			return { stdout, stderr, exitCode };
		} finally {
			// タイムアウトタイマーを確実にクリア
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		}
	}

	/**
	 * タイムアウト処理を設定
	 * @private
	 */
	private setupTimeout(
		proc: Subprocess,
		timeout: number,
	): ReturnType<typeof setTimeout> {
		const timeoutId = setTimeout(() => {
			proc.kill();
		}, timeout);

		// プロセス終了時にタイマーをクリア
		proc.exited.then(() => clearTimeout(timeoutId));

		return timeoutId;
	}

	/**
	 * 標準入力にデータを書き込む
	 * @private
	 */
	private async writeStdin(stdin: FileSink, data: string): Promise<void> {
		try {
			stdin.write(data);
			stdin.end();
		} catch (error) {
			throw new Error("Failed to write to stdin", { cause: error });
		}
	}
}
