/**
 * BackendOutputStreamer - AIエージェントの標準出力/標準エラー出力をリアルタイムでログファイルに書き込む
 *
 * v2.0.0 F-103: バックエンド出力ストリーミング
 *
 * @example
 * ```typescript
 * const streamer = new BackendOutputStreamer({
 *   logPath: ".agent/task-123/backend.log",
 *   includeTimestamp: true,
 * });
 *
 * // AIエージェントの出力をストリーミング
 * streamer.writeStdout("Agent output");
 * streamer.writeStderr("Error message");
 *
 * // 完了時にクローズ
 * streamer.close();
 * ```
 */

import * as fs from "node:fs";
import * as path from "node:path";

/**
 * BackendOutputStreamer設定
 */
export interface BackendOutputStreamerConfig {
	/**
	 * ログファイルパス
	 */
	logPath: string;

	/**
	 * タイムスタンプを付与するか
	 * @default true
	 */
	includeTimestamp?: boolean;
}

/**
 * AIエージェントの出力をリアルタイムでログファイルに書き込むクラス
 */
export class BackendOutputStreamer {
	private readonly logPath: string;
	private readonly includeTimestamp: boolean;
	private fileHandle: number | null = null;
	private closed = false;

	/**
	 * BackendOutputStreamerを作成
	 *
	 * @param config - 設定
	 */
	constructor(config: BackendOutputStreamerConfig) {
		this.logPath = config.logPath;
		this.includeTimestamp = config.includeTimestamp ?? true;
	}

	/**
	 * ファイルハンドルを取得（遅延初期化）
	 */
	private getFileHandle(): number | null {
		if (this.closed) {
			return null;
		}

		if (this.fileHandle === null) {
			try {
				// ディレクトリが存在しない場合は作成
				const dir = path.dirname(this.logPath);
				if (!fs.existsSync(dir)) {
					fs.mkdirSync(dir, { recursive: true });
				}

				// ファイルを追記モードで開く
				this.fileHandle = fs.openSync(this.logPath, "a");
			} catch (error) {
				console.warn(
					`Failed to open backend.log: ${error instanceof Error ? error.message : String(error)}`,
				);
				return null;
			}
		}

		return this.fileHandle;
	}

	/**
	 * データをファイルに書き込む
	 *
	 * @param stream - ストリーム種別（stdout/stderr）
	 * @param data - 書き込むデータ
	 */
	private write(stream: "stdout" | "stderr", data: string | Buffer): void {
		if (this.closed) {
			return;
		}

		const content = typeof data === "string" ? data : data.toString("utf-8");

		// 空文字列は無視
		if (content === "") {
			return;
		}

		const handle = this.getFileHandle();
		if (handle === null) {
			return;
		}

		try {
			let line: string;
			if (this.includeTimestamp) {
				const timestamp = new Date().toISOString();
				line = `[${timestamp}] [${stream}] ${content}\n`;
			} else {
				line = `[${stream}] ${content}\n`;
			}

			fs.writeSync(handle, line);
		} catch (error) {
			console.warn(
				`Failed to write to backend.log: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * stdoutデータを書き込む
	 *
	 * @param data - データ
	 */
	writeStdout(data: string | Buffer): void {
		this.write("stdout", data);
	}

	/**
	 * stderrデータを書き込む
	 *
	 * @param data - データ
	 */
	writeStderr(data: string | Buffer): void {
		this.write("stderr", data);
	}

	/**
	 * ストリーマーを閉じる
	 */
	close(): void {
		if (this.closed) {
			return;
		}

		this.closed = true;

		if (this.fileHandle !== null) {
			try {
				fs.closeSync(this.fileHandle);
			} catch {
				// 無視
			}
			this.fileHandle = null;
		}
	}
}
