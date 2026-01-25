import { join } from "node:path";

/**
 * タスクのログファイルパスを検索
 *
 * @param taskId タスクID
 * @param baseDir ベースディレクトリ（デフォルト: ".agent"）
 * @returns ログファイルのパス、存在しない場合はnull
 */
export async function findTaskLogPath(taskId: string, baseDir = ".agent"): Promise<string | null> {
	const logPath = join(baseDir, taskId, "output.log");
	const file = Bun.file(logPath);
	const exists = await file.exists();
	return exists ? logPath : null;
}

/**
 * ログファイルから最後のN行を読み取る
 *
 * @param logPath ログファイルのパス
 * @param lines 読み取る行数（デフォルト: 100）
 * @returns 行の配列
 */
export async function readLastNLines(logPath: string, lines = 100): Promise<string[]> {
	const file = Bun.file(logPath);
	const content = await file.text();

	if (!content) {
		return [];
	}

	const allLines = content.split("\n").filter((line) => line !== "");
	return allLines.slice(-lines);
}
