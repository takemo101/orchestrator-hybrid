import { appendFile, mkdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { logger } from "./logger.js";

export interface SessionRecord {
	iteration: number;
	hat: string;
	prompt: string;
	output: string;
	events: string[];
	timestamp: string;
}

export class SessionRecorder {
	private readonly filePath: string;
	private readonly maxSizeBytes = 100 * 1024 * 1024;
	private isRecording = false;

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	async startRecording(): Promise<void> {
		try {
			await mkdir(dirname(this.filePath), { recursive: true });
			await unlink(this.filePath).catch(() => {});
			await writeFile(this.filePath, "");

			this.isRecording = true;
			logger.info(`セッション記録開始: ${this.filePath}`);
		} catch (error) {
			logger.error(`セッション記録の開始に失敗しました: ${error}`);
			throw error;
		}
	}

	async recordIteration(
		iteration: number,
		hat: string,
		prompt: string,
		output: string,
		events: string[],
	): Promise<void> {
		if (!this.isRecording) {
			logger.warn("セッション記録が開始されていません");
			return;
		}

		try {
			const sizeExceeded = await this.checkSize();
			if (sizeExceeded) {
				return;
			}

			const record: SessionRecord = {
				iteration,
				hat,
				prompt,
				output,
				events,
				timestamp: new Date().toISOString(),
			};

			const line = `${JSON.stringify(record)}\n`;
			await appendFile(this.filePath, line);

			logger.debug(`イテレーション ${iteration} を記録`);
		} catch (error) {
			logger.error(
				`セッション記録の書き込みに失敗しました。記録をスキップして実行継続します。: ${error}`,
			);
		}
	}

	async stopRecording(): Promise<void> {
		this.isRecording = false;
		logger.info(`セッション記録完了: ${this.filePath}`);
	}

	private async checkSize(): Promise<boolean> {
		try {
			const stats = await stat(this.filePath);
			if (stats.size > this.maxSizeBytes) {
				logger.warn("セッション記録のサイズが上限（100MB）を超えました。記録を停止します。");
				this.isRecording = false;
				return true;
			}
		} catch {
			// ファイルが存在しない場合は無視
		}
		return false;
	}
}
