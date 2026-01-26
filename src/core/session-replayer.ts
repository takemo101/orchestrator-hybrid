import { readFile } from "node:fs/promises";
import { logger } from "./logger.js";
import type { SessionRecord } from "./session-recorder.js";

export interface ReplayResult {
	success: boolean;
	iterations: number;
	errors: string[];
}

export class SessionReplayer {
	private readonly filePath: string;

	constructor(filePath: string) {
		this.filePath = filePath;
	}

	async replay(): Promise<ReplayResult> {
		const errors: string[] = [];

		try {
			const records = await this.loadRecords();
			logger.info(`セッションリプレイ開始: ${records.length}イテレーション`);

			for (const record of records) {
				try {
					await this.replayIteration(record);
				} catch (error) {
					const errorMsg = `イテレーション ${record.iteration} のリプレイに失敗: ${error}`;
					logger.error(errorMsg);
					errors.push(errorMsg);
				}
			}

			const success = errors.length === 0;
			logger.info(`セッションリプレイ完了: ${success ? "成功" : "失敗"}`);

			return {
				success,
				iterations: records.length,
				errors,
			};
		} catch (error) {
			logger.error(`セッションリプレイに失敗: ${error}`);
			return {
				success: false,
				iterations: 0,
				errors: [String(error)],
			};
		}
	}

	async loadRecords(): Promise<SessionRecord[]> {
		try {
			const content = await readFile(this.filePath, "utf-8");
			const lines = content
				.trim()
				.split("\n")
				.filter((line) => line);

			return lines.map((line) => JSON.parse(line) as SessionRecord);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				throw new Error(`セッション記録ファイルが見つかりません: ${this.filePath}`);
			}
			throw error;
		}
	}

	private async replayIteration(record: SessionRecord): Promise<void> {
		logger.info(`Replaying iteration ${record.iteration}: ${record.hat}`);

		const outputPreview =
			record.output.length > 200 ? `${record.output.substring(0, 200)}...` : record.output;
		logger.info(`Output: ${outputPreview}`);

		if (record.events.length > 0) {
			logger.info(`Events: ${record.events.join(", ")}`);
		}
	}
}
