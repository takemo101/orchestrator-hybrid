/**
 * F-008 ログ監視
 *
 * ISessionManagerを利用してセッション出力をリアルタイムで表示する。
 */

/**
 * セッション管理インターフェース (F-012)
 * ログ監視はこのインターフェースのサブセットを使用する
 */
export interface ISessionManager {
	/**
	 * セッションの直近の出力を取得する
	 * @param id セッションID
	 * @param lines 取得する行数
	 */
	getOutput(id: string, lines?: number): Promise<string>;

	/**
	 * セッション出力をリアルタイムでストリーミングする
	 * @param id セッションID
	 */
	streamOutput(id: string): AsyncIterable<string>;

	/**
	 * セッションが実行中か確認する
	 * @param id セッションID
	 */
	isRunning(id: string): Promise<boolean>;
}

/**
 * ログ表示オプション
 */
export interface LogOptions {
	/** リアルタイムストリーミングを有効化 */
	follow: boolean;
	/** 表示する行数 */
	lines: number;
}

/**
 * ログ監視クラス
 *
 * ISessionManagerを介してセッション出力を取得・表示する。
 * --followオプションでリアルタイムストリーミングを提供。
 */
export class LogMonitor {
	private abortController: AbortController | null = null;

	constructor(
		private readonly sessionManager: ISessionManager,
		private readonly writer: { write(data: string): void } = process.stdout,
	) {}

	/**
	 * ログを表示する
	 *
	 * @param id セッションID (orch-<issue>)
	 * @param options 表示オプション
	 */
	async showLogs(id: string, options: LogOptions): Promise<void> {
		// まず過去のログを取得して表示
		const output = await this.sessionManager.getOutput(id, options.lines);
		if (output) {
			this.writer.write(output);
		}

		// --follow モードの場合、リアルタイムストリーミングを開始
		if (options.follow) {
			await this.stream(id);
		}
	}

	/**
	 * リアルタイムストリーミングを停止する
	 */
	stop(): void {
		if (this.abortController) {
			this.abortController.abort();
			this.abortController = null;
		}
	}

	/**
	 * リアルタイムストリーミングを開始する
	 *
	 * @param id セッションID
	 */
	private async stream(id: string): Promise<void> {
		this.abortController = new AbortController();
		const signal = this.abortController.signal;

		try {
			for await (const chunk of this.sessionManager.streamOutput(id)) {
				if (signal.aborted) {
					break;
				}
				this.writer.write(chunk);
			}
		} catch (error) {
			// AbortErrorは正常な中断
			if (error instanceof Error && error.name === "AbortError") {
				return;
			}
			throw error;
		}
	}
}
