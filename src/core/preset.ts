import { OrchestratorError } from "./errors.js";
import { BUILTIN_HATS } from "./hat.js";
import type { HatDefinition, OrchestratorConfig } from "./types.js";

/**
 * プリセットエラー
 */
export class PresetError extends OrchestratorError {
	readonly presetName?: string;

	constructor(message: string, options?: ErrorOptions & { presetName?: string }) {
		super(message, options);
		this.name = "PresetError";
		this.presetName = options?.presetName;
	}
}

/**
 * プリセット定義
 */
export interface PresetDefinition {
	/** プリセット名 */
	name: string;
	/** プリセットの説明 */
	description: string;
	/** プリセット設定 */
	config: PresetConfig;
}

/**
 * プリセット設定（OrchestratorConfigの部分型）
 */
export interface PresetConfig {
	/** Hat定義 */
	hats?: Record<string, HatDefinition>;
	/** 最大反復回数 */
	max_iterations?: number;
	/** 完了キーワード */
	completion_keyword?: string;
}

/**
 * 組み込みプリセット定義
 */
export const BUILTIN_PRESETS: Record<string, PresetDefinition> = {
	simple: {
		name: "simple",
		description: "Hatを使用しない単純な反復ループ。AIが LOOP_COMPLETE を出力するまで反復します。",
		config: {
			hats: {},
		},
	},
	tdd: {
		name: "tdd",
		description:
			"テスト駆動開発（Red → Green → Refactor）を強制するワークフロー。Tester, Implementer, RefactorerのHatを使用します。",
		config: {
			hats: {
				tester: BUILTIN_HATS.tester,
				implementer: BUILTIN_HATS.implementer,
				refactorer: BUILTIN_HATS.refactorer,
			},
		},
	},
};

/**
 * プリセットローダー
 *
 * プリセット定義の読み込みと設定マージを担当する。
 */
export class PresetLoader {
	private readonly presets: Map<string, PresetDefinition>;

	constructor() {
		this.presets = new Map();
		for (const [name, preset] of Object.entries(BUILTIN_PRESETS)) {
			this.presets.set(name, preset);
		}
	}

	/**
	 * 利用可能なプリセット名の一覧を返す
	 *
	 * @returns プリセット名の配列
	 */
	listPresets(): string[] {
		return Array.from(this.presets.keys());
	}

	/**
	 * プリセットを読み込む
	 *
	 * @param presetName - プリセット名
	 * @returns プリセット設定
	 * @throws {PresetError} プリセットが見つからない場合
	 */
	loadPreset(presetName: string): PresetConfig {
		const preset = this.presets.get(presetName);
		if (!preset) {
			throw new PresetError(`プリセット '${presetName}' が見つかりません`, {
				presetName,
			});
		}
		return preset.config;
	}

	/**
	 * プリセットの説明を取得する
	 *
	 * @param presetName - プリセット名
	 * @returns プリセットの説明
	 * @throws {PresetError} プリセットが見つからない場合
	 */
	getPresetDescription(presetName: string): string {
		const preset = this.presets.get(presetName);
		if (!preset) {
			throw new PresetError(`プリセット '${presetName}' が見つかりません`, {
				presetName,
			});
		}
		return preset.description;
	}

	/**
	 * プリセット定義を取得する
	 *
	 * @param presetName - プリセット名
	 * @returns プリセット定義
	 * @throws {PresetError} プリセットが見つからない場合
	 */
	getPreset(presetName: string): PresetDefinition {
		const preset = this.presets.get(presetName);
		if (!preset) {
			throw new PresetError(`プリセット '${presetName}' が見つかりません`, {
				presetName,
			});
		}
		return preset;
	}
}

/**
 * 設定をマージする
 *
 * base設定がpreset設定より優先される。
 * base設定に存在しないキーのみpreset設定から取得する。
 *
 * @param base - ベース設定（優先される）
 * @param preset - プリセット設定（デフォルト値）
 * @returns マージされた設定
 */
export function mergeConfigs(
	base: Partial<OrchestratorConfig>,
	preset: Partial<OrchestratorConfig>,
): Partial<OrchestratorConfig> {
	const result: Partial<OrchestratorConfig> = { ...preset };

	for (const [key, value] of Object.entries(base)) {
		if (value !== undefined) {
			(result as Record<string, unknown>)[key] = value;
		}
	}

	return result;
}

/**
 * プリセット名からプリセット定義を取得する（ヘルパー関数）
 *
 * @param presetName - プリセット名
 * @returns プリセット定義
 * @throws {PresetError} プリセットが見つからない場合
 */
export function getPreset(presetName: string): PresetDefinition {
	const loader = new PresetLoader();
	return loader.getPreset(presetName);
}

/**
 * 利用可能なプリセット名の一覧を取得する（ヘルパー関数）
 *
 * @returns プリセット名の配列
 */
export function listPresets(): string[] {
	const loader = new PresetLoader();
	return loader.listPresets();
}
