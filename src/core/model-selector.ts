import { logger } from "./logger.js";
import type { Config } from "./types.js";

/**
 * Claude Code CLIのモデルエイリアス
 * 短い名前とフルモデル名のマッピング
 */
export const MODEL_ALIASES: Record<string, string> = {
	opus: "claude-opus-4-20250514",
	sonnet: "claude-sonnet-4-20250514",
	haiku: "claude-haiku-3-20240307",
};

/**
 * デフォルトモデル
 */
const DEFAULT_MODEL = "sonnet";

/**
 * Hat毎のモデル選択を解決するクラス
 *
 * 優先順位:
 * 1. CLIオプション（--model）
 * 2. Hat固有設定（hats.<hat>.model）
 * 3. グローバル設定（backend.model）
 * 4. デフォルト値（sonnet）
 */
export class ModelSelector {
	private readonly config: Config;

	/**
	 * コンストラクタ
	 * @param config - orchestrator設定
	 */
	constructor(config: Config) {
		this.config = config;
	}

	/**
	 * 指定されたHatのモデルを解決
	 *
	 * @param hatName - Hat名
	 * @returns モデル名（opus/sonnet/haiku またはフルモデル名）
	 */
	resolveModel(hatName: string): string {
		// 1. Hat固有モデルを確認
		const hatConfig = this.config.hats?.[hatName];
		if (hatConfig?.model) {
			if (this.isValidModel(hatConfig.model)) {
				return hatConfig.model;
			}
			logger.warn(
				`Invalid model "${hatConfig.model}" for hat "${hatName}". Using global or default model.`,
			);
		}

		// 2. グローバルモデルを確認
		const globalModel = this.config.backend.model;
		if (globalModel) {
			if (this.isValidModel(globalModel)) {
				return globalModel;
			}
			logger.warn(
				`Invalid model "${globalModel}" in backend config. Using default model.`,
			);
		}

		// 3. デフォルトモデルを返す
		return DEFAULT_MODEL;
	}

	/**
	 * CLIオプションを優先してモデルを解決
	 *
	 * @param hatName - Hat名
	 * @param override - CLIから指定されたモデル（オプション）
	 * @returns モデル名
	 */
	resolveModelWithOverride(hatName: string, override?: string): string {
		if (override) {
			return override;
		}
		return this.resolveModel(hatName);
	}

	/**
	 * エイリアスをフルモデル名に展開
	 *
	 * @param modelOrAlias - エイリアスまたはフルモデル名
	 * @returns フルモデル名
	 */
	expandAlias(modelOrAlias: string): string {
		return MODEL_ALIASES[modelOrAlias] ?? modelOrAlias;
	}

	/**
	 * モデル名が有効かどうかを検証
	 *
	 * @param model - モデル名
	 * @returns 有効な場合true
	 */
	isValidModel(model: string): boolean {
		// 空文字は無効
		if (!model) {
			return false;
		}

		// 既知のエイリアスは有効
		if (model in MODEL_ALIASES) {
			return true;
		}

		// claude-で始まるフルモデル名は有効
		if (model.startsWith("claude-")) {
			return true;
		}

		return false;
	}

	/**
	 * デフォルトモデルを取得
	 *
	 * @returns デフォルトモデル名
	 */
	getDefaultModel(): string {
		return DEFAULT_MODEL;
	}
}
