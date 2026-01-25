import { join } from "node:path";
import { watch, type FSWatcher } from "node:fs";
import { LogMonitorError } from "./errors.js";
import { logger } from "./logger.js";

/**
 * ログ監視設定
 */
export interface LogMonitorConfig {
	/**
	 * タスクID
	 */
	taskId: string;

	/**
	 * ログディレクトリのベースパス
	 * @default ".agent"
	 */
	baseDir?: string;

	/**
	 * ポーリング間隔（ミリ秒）
	 * fs.watch()が使えない場合のフォールバック
	 * @default 500
	 */
	pollInterval?: number;
}

/**
 * 別プロセスからログファイルをリアルタイム監視するクラス
 *
 * fs.watch()を使用したイベント駆動監視と、
 * pollingモードへの自動フォールバックをサポートします。
 *
 * @example
 * ```typescript
 * const monitor = new LogMonitor({ taskId: "task-123" });
 *
 * // 別ターミナルから監視開始
 * await monitor.monitor((line) => {
 *   console.log(line);
 * });
 *
 * // Ctrl+Cで停止
 * process.on("SIGINT", () => {
 *   monitor.stop();
 * });
 * ```
 */
export class LogMonitor {
	private readonly taskId: string;
	private readonly logPath: string;
	private readonly pollInterval: number;
	private abortController: AbortController | null = null;
	private lastSize = 0;

	constructor(config: LogMonitorConfig) {
		this.taskId = config.taskId;
		this.logPath = join(config.baseDir ?? ".agent", config.taskId, "output.log");
		this.pollInterval = config.pollInterval ?? 500;
	}

	/**
	 * 監視対象のログファイルパスを取得
	 */
	getLogPath(): string {
		return this.logPath;
	}

	/**
	 * ログファイルをリアルタイムで監視
	 *
	 * @param callback - 新しい行が追加されたときに呼ばれる関数
	 * @throws LogMonitorError - ログファイルが存在しない場合
	 */
	async monitor(callback: (line: string) => void): Promise<void> {
		// ファイルの存在確認
		const file = Bun.file(this.logPath);
		if (!(await file.exists())) {
			throw new LogMonitorError(`ログファイルが見つかりません: ${this.logPath}`, {
				taskId: this.taskId,
				logPath: this.logPath,
			});
		}

		// 初期サイズを取得
		this.lastSize = file.size;

		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		// fs.watch() を試行
		try {
			await this.monitorWithWatch(callback, signal);
		} catch (error) {
			// fs.watch() が使えない場合はpollingにフォールバック
			if (!signal.aborted) {
				logger.warn("fs.watch() が使えません。pollingモードで監視します。");
				await this.monitorWithPolling(callback, signal);
			}
		}
	}

	/**
	 * 監視を停止
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	/**
	 * fs.watch() を使用した監視
	 */
	private async monitorWithWatch(callback: (line: string) => void, signal: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			let watcher: FSWatcher;

			try {
				watcher = watch(this.logPath, { persistent: true }, async (eventType) => {
					if (signal.aborted) {
						watcher.close();
						resolve();
						return;
					}

					if (eventType === "change") {
						try {
							await this.readNewLines(callback);
						} catch (error) {
							logger.debug("Failed to read new lines", { error });
						}
					}
				});
			} catch (error) {
				reject(error);
				return;
			}

			watcher.on("error", (error) => {
				watcher.close();
				if (!signal.aborted) {
					reject(error);
				}
			});

			// シグナルでアボートされたら終了
			signal.addEventListener("abort", () => {
				watcher.close();
				resolve();
			});
		});
	}

	/**
	 * polling を使用した監視
	 */
	private async monitorWithPolling(callback: (line: string) => void, signal: AbortSignal): Promise<void> {
		while (!signal.aborted) {
			try {
				await this.readNewLines(callback);
			} catch (error) {
				logger.debug("Failed to read new lines", { error });
			}
			await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
		}
	}

	/**
	 * 新しい行を読み取り
	 */
	private async readNewLines(callback: (line: string) => void): Promise<void> {
		const file = Bun.file(this.logPath);
		const currentSize = file.size;

		if (currentSize > this.lastSize) {
			// 新しいデータを読み取る
			const content = await file.text();
			const newContent = content.slice(this.lastSize);
			const lines = newContent.split("\n");

			for (const line of lines) {
				if (line.trim()) {
					callback(line);
				}
			}

			this.lastSize = currentSize;
		}
	}
}
