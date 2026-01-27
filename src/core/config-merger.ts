/**
 * ConfigMerger - CLIオプション、設定ファイル、デフォルト値の統合
 *
 * v2.0.0 F-101: run設定デフォルト化
 *
 * 優先順位:
 * 1. CLIオプション（最優先）
 * 2. 設定ファイル（orch.yml の run セクション）
 * 3. デフォルト値
 */

import * as fs from "node:fs";
import * as yaml from "yaml";
import { type RunConfig, RunConfigSchema } from "./types.js";

/**
 * マージオプション
 */
export interface MergeOptions {
	/**
	 * CLIオプション（最優先）
	 * undefined の場合は無視される
	 */
	cliOptions: Partial<RunConfig>;

	/**
	 * 設定ファイルパス
	 */
	configPath?: string;
}

/**
 * デフォルトのRun設定
 */
const DEFAULT_RUN_CONFIG: RunConfig = {
	auto_mode: false,
	create_pr: false,
	draft_pr: false,
};

/**
 * ConfigMergerクラス
 *
 * CLIオプション、設定ファイル、デフォルト値を優先順位に従って統合します。
 */
export class ConfigMerger {
	/**
	 * 設定を統合する
	 *
	 * @param options - マージオプション
	 * @returns 統合されたRunConfig
	 */
	merge(options: MergeOptions): RunConfig {
		const { cliOptions, configPath } = options;

		// 設定ファイルから読み込み
		const fileConfig = this.loadConfigFromFile(configPath);

		// 優先順位に従ってマージ
		// 1. CLIオプション（最優先）
		// 2. 設定ファイル
		// 3. デフォルト値
		return {
			auto_mode: cliOptions.auto_mode ?? fileConfig?.auto_mode ?? DEFAULT_RUN_CONFIG.auto_mode,
			create_pr: cliOptions.create_pr ?? fileConfig?.create_pr ?? DEFAULT_RUN_CONFIG.create_pr,
			draft_pr: cliOptions.draft_pr ?? fileConfig?.draft_pr ?? DEFAULT_RUN_CONFIG.draft_pr,
		};
	}

	/**
	 * デフォルト値を取得する
	 *
	 * @returns デフォルトのRunConfig
	 */
	getDefaults(): RunConfig {
		return { ...DEFAULT_RUN_CONFIG };
	}

	/**
	 * 設定ファイルからrun設定を読み込む
	 *
	 * @param configPath - 設定ファイルパス
	 * @returns RunConfigまたはnull
	 */
	private loadConfigFromFile(configPath?: string): Partial<RunConfig> | null {
		if (!configPath) {
			return null;
		}

		try {
			if (!fs.existsSync(configPath)) {
				return null;
			}

			const content = fs.readFileSync(configPath, "utf-8");
			const parsed = yaml.parse(content);

			if (!parsed || typeof parsed !== "object") {
				return null;
			}

			// run セクションが存在しない場合
			if (!parsed.run || typeof parsed.run !== "object") {
				return null;
			}

			// zodでバリデーション
			const result = RunConfigSchema.safeParse(parsed.run);
			if (!result.success) {
				// バリデーションエラーの場合はnullを返す
				return null;
			}

			return result.data;
		} catch {
			// YAML解析エラー等の場合はnullを返す
			return null;
		}
	}
}
