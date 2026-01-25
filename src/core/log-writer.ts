import { mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * LogWriter 設定
 */
export interface LogWriterConfig {
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
}

/**
 * ログファイル書き込みコンポーネント
 *
 * タスク実行中のログをファイルに書き込む。
 * stdout、stderr、全出力を適切なファイルに振り分ける。
 *
 * @example
 * ```typescript
 * const logWriter = new LogWriter({ taskId: "task-42-20260124-123456" });
 * await logWriter.initialize();
 *
 * await logWriter.writeStdout("Hello, World!\n");
 * await logWriter.writeStderr("An error occurred\n");
 * ```
 */
export class LogWriter {
	private readonly taskId: string;
	private readonly logDir: string;
	private readonly outputPath: string;
	private readonly stdoutPath: string;
	private readonly stderrPath: string;
	private initialized = false;

	constructor(config: LogWriterConfig) {
		this.taskId = config.taskId;
		this.logDir = join(config.baseDir ?? ".agent", config.taskId);
		this.outputPath = join(this.logDir, "output.log");
		this.stdoutPath = join(this.logDir, "stdout.log");
		this.stderrPath = join(this.logDir, "stderr.log");
	}

	/**
	 * ログディレクトリとファイルを初期化
	 *
	 * - ディレクトリを作成（既存の場合はスキップ）
	 * - ログファイルは初回書き込み時に自動作成される
	 */
	async initialize(): Promise<void> {
		if (this.initialized) {
			return;
		}

		// ディレクトリを再帰的に作成
		await mkdir(this.logDir, { recursive: true });
		this.initialized = true;
	}

	/**
	 * 標準出力を記録
	 *
	 * - stdout.log に追記
	 * - output.log にも追記
	 *
	 * @param data - 書き込むデータ
	 */
	async writeStdout(data: string): Promise<void> {
		this.ensureInitialized();

		// 並行書き込み（順序は保証されない）
		await Promise.all([
			this.appendToFile(this.stdoutPath, data),
			this.appendToFile(this.outputPath, data),
		]);
	}

	/**
	 * 標準エラー出力を記録
	 *
	 * - stderr.log に追記
	 * - output.log にも追記
	 *
	 * @param data - 書き込むデータ
	 */
	async writeStderr(data: string): Promise<void> {
		this.ensureInitialized();

		await Promise.all([
			this.appendToFile(this.stderrPath, data),
			this.appendToFile(this.outputPath, data),
		]);
	}

	/**
	 * 任意のメッセージを output.log に記録
	 *
	 * stdout/stderr の区別が不要な場合に使用
	 *
	 * @param data - 書き込むデータ
	 */
	async writeOutput(data: string): Promise<void> {
		this.ensureInitialized();
		await this.appendToFile(this.outputPath, data);
	}

	/**
	 * ログディレクトリのパスを取得
	 *
	 * @returns ログディレクトリのパス
	 */
	getLogDir(): string {
		return this.logDir;
	}

	/**
	 * 初期化済みか確認
	 * @throws 初期化されていない場合
	 */
	private ensureInitialized(): void {
		if (!this.initialized) {
			throw new Error("LogWriter not initialized. Call initialize() first.");
		}
	}

	/**
	 * ファイルに追記
	 *
	 * Bun.write() の append オプションを使用
	 *
	 * @param path - ファイルパス
	 * @param data - 書き込むデータ
	 */
	private async appendToFile(path: string, data: string): Promise<void> {
		const file = Bun.file(path);
		const exists = await file.exists();

		if (exists) {
			// 既存ファイルに追記
			const currentContent = await file.text();
			await Bun.write(path, currentContent + data);
		} else {
			// 新規ファイル作成
			await Bun.write(path, data);
		}
	}
}
