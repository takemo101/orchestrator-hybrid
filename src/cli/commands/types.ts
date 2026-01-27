/**
 * CLI共通型定義
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import type { Command } from "commander";

/**
 * コマンドハンドラーインターフェース
 *
 * 各コマンドはこのインターフェースを実装し、
 * Commanderプログラムに自身を登録します。
 */
export interface CommandHandler {
	/**
	 * コマンドを登録する
	 *
	 * @param program - commanderプログラム
	 */
	register(program: Command): void;
}

/**
 * runコマンドオプション
 */
export interface RunCommandOptions {
	issue?: string;
	issues?: string;
	backend?: string;
	preset?: string;
	maxIterations?: number;
	auto?: boolean;
	createPr?: boolean;
	draft?: boolean;
	container?: boolean;
	autoMerge?: boolean;
	resolveDeps?: boolean;
	ignoreDeps?: boolean;
	report?: string | boolean;
	recordSession?: string;
	config?: string;
	verbose?: boolean;
}

/**
 * statusコマンドオプション
 */
export interface StatusCommandOptions {
	all?: boolean;
	task?: string;
	issue?: string;
	config?: string;
}

/**
 * ログソース種別
 *
 * v2.0.0 F-104: logsコマンド拡張
 */
export type LogSource = "task" | "backend";

/**
 * logsコマンドオプション
 */
export interface LogsCommandOptions {
	task?: string;
	source?: LogSource;
	follow?: boolean;
	lines?: number;
	table?: boolean;
	interval?: number;
}

/**
 * cancelコマンドオプション
 */
export interface CancelCommandOptions {
	task?: string;
	all?: boolean;
}

/**
 * initコマンドオプション
 */
export interface InitCommandOptions {
	preset?: string;
	listPresets?: boolean;
	force?: boolean;
	labels?: boolean;
}

/**
 * emitコマンドオプション
 */
export interface EmitCommandOptions {
	json?: boolean;
	target?: string;
}

/**
 * タスクツールコマンドオプション
 */
export interface TaskToolOptions {
	priority?: string;
	blockedBy?: string;
}
