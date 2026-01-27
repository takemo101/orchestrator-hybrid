/**
 * 表示フォーマットユーティリティ
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import chalk from "chalk";

/**
 * ミリ秒を人間が読みやすい形式にフォーマットする
 *
 * @param ms - ミリ秒
 * @returns フォーマットされた文字列
 */
export function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
	const hours = Math.floor(minutes / 60);
	return `${hours}h ${minutes % 60}m`;
}

/**
 * 日付を相対時間でフォーマットする
 *
 * @param date - 日付
 * @returns 相対時間文字列
 */
export function formatRelativeTime(date: Date): string {
	const now = Date.now();
	const diff = now - date.getTime();
	const seconds = Math.floor(diff / 1000);

	if (seconds < 60) return `${seconds}s ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

/**
 * ステータスに応じたアイコンを取得する
 *
 * @param status - ステータス文字列
 * @returns アイコン
 */
export function getStatusIcon(status: string): string {
	switch (status) {
		case "pending":
			return chalk.gray("○");
		case "running":
			return chalk.blue("●");
		case "completed":
			return chalk.green("✓");
		case "failed":
			return chalk.red("✗");
		case "cancelled":
			return chalk.yellow("⊘");
		default:
			return "?";
	}
}

/**
 * タスクステータスに応じたアイコンを取得する
 *
 * @param status - ステータス文字列
 * @returns アイコン
 */
export function getTaskStatusIcon(status: string): string {
	switch (status) {
		case "open":
			return chalk.gray("○");
		case "in-progress":
			return chalk.blue("●");
		case "closed":
			return chalk.green("✓");
		default:
			return "?";
	}
}
