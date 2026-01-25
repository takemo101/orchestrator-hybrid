import { join } from "node:path";

/**
 * LogStreamer 設定
 */
export interface LogStreamerConfig {
	/**
	 * タスクを一意に識別するID
	 * @example "task-42-20260124-123456"
	 */
	taskId: string;

	/**
	 * ログディレクトリのベースパス
	 * @default ".agent"
	 */
	baseDir?: string;

	/**
	 * リアルタイム監視モード
	 * - true: ファイルを継続的に監視し、新しい行を即座に通知
	 * - false: ファイル全体を一度だけ読み取って終了
	 * @default false
	 */
	follow?: boolean;

	/**
	 * ポーリング間隔（ミリ秒）
	 * follow=true の場合にのみ使用
	 * @default 100
	 */
	pollInterval?: number;

	/**
	 * 表示する行数
	 * 指定した場合、ファイルの最後のN行のみを読み取る
	 * @default undefined (全行)
	 */
	lines?: number;
}

/**
 * ログファイルリアルタイム読み取りコンポーネント
 *
 * ログファイルを監視し、新しい出力をコールバックで通知する。
 * follow=true の場合はポーリング方式で継続的に監視し、
 * follow=false の場合は一度だけ読み取って終了する。
 *
 * @example
 * ```typescript
 * const streamer = new LogStreamer({
 *   taskId: "task-42-20260124-123456",
 *   follow: true,
 * });
 *
 * await streamer.stream((line) => {
 *   console.log(line);
 * });
 *
 * // Ctrl+C で停止
 * process.on("SIGINT", () => streamer.stop());
 * ```
 */
export class LogStreamer {
	private readonly taskId: string;
	private readonly logPath: string;
	private readonly follow: boolean;
	private readonly pollInterval: number;
	private readonly lines?: number;
	private abortController: AbortController | null = null;

	constructor(config: LogStreamerConfig) {
		this.taskId = config.taskId;
		this.logPath = join(
			config.baseDir ?? ".agent",
			config.taskId,
			"output.log",
		);
		this.follow = config.follow ?? false;
		this.pollInterval = config.pollInterval ?? 100;
		this.lines = config.lines;
	}

	/**
	 * ログファイルをストリーミング
	 *
	 * ファイルの内容を読み取り、各行をコールバックに渡す。
	 * follow=true の場合は新しい行が追加されるたびにコールバックが呼ばれる。
	 * follow=false の場合は現在の内容を一度だけ読み取って終了。
	 *
	 * @param callback 新しい行が追加されたときに呼ばれる関数
	 * @throws ファイルが存在しない場合
	 */
	async stream(callback: (line: string) => void): Promise<void> {
		this.abortController = new AbortController();
		const { signal } = this.abortController;

		// ファイルの存在確認
		const file = Bun.file(this.logPath);
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`Log file not found: ${this.logPath}`);
		}

		if (this.follow) {
			await this.streamFollow(callback, signal);
		} else {
			await this.streamOnce(callback);
		}
	}

	/**
	 * ストリーミングを停止
	 *
	 * follow=true で監視中の場合、ストリーミングを終了する。
	 * 複数回呼んでも安全。
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	/**
	 * ログファイルのパスを取得
	 *
	 * @returns output.log のフルパス
	 */
	getLogPath(): string {
		return this.logPath;
	}

	/**
	 * 一度だけ読み取るモード
	 */
	private async streamOnce(callback: (line: string) => void): Promise<void> {
		const file = Bun.file(this.logPath);
		const content = await file.text();
		const allLines = content.split("\n").filter((line) => line !== "");

		const linesToReturn = this.lines
			? allLines.slice(-this.lines)
			: allLines;

		for (const line of linesToReturn) {
			callback(line);
		}
	}

	/**
	 * 継続監視モード（ポーリング）
	 */
	private async streamFollow(
		callback: (line: string) => void,
		signal: AbortSignal,
	): Promise<void> {
		let lastPosition = 0;

		// 初回読み取り
		const file = Bun.file(this.logPath);
		const initialContent = await file.text();
		const initialLines = initialContent
			.split("\n")
			.filter((line) => line !== "");

		// lines オプションがある場合は最後のN行のみ
		const linesToEmit = this.lines
			? initialLines.slice(-this.lines)
			: initialLines;

		for (const line of linesToEmit) {
			callback(line);
		}

		lastPosition = initialContent.length;

		// ポーリングループ
		while (!signal.aborted) {
			await this.sleep(this.pollInterval);

			if (signal.aborted) {
				break;
			}

			const currentFile = Bun.file(this.logPath);
			const currentContent = await currentFile.text();

			if (currentContent.length > lastPosition) {
				// 新しいコンテンツを抽出
				const newContent = currentContent.slice(lastPosition);
				const newLines = newContent
					.split("\n")
					.filter((line) => line !== "");

				for (const line of newLines) {
					callback(line);
				}

				lastPosition = currentContent.length;
			}
		}
	}

	/**
	 * 指定ミリ秒スリープ
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}
