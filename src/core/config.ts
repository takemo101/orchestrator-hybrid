import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import {
	type HatDefinition,
	HatDefinitionSchema,
	type OrchestratorConfig,
	OrchestratorConfigSchema,
} from "./types.js";

/**
 * 設定ファイル検証エラー
 *
 * zodスキーマ検証で発生したエラーを、ユーザーフレンドリーな形式で提供する。
 */
export class ConfigValidationError extends Error {
	/** 個別のエラー情報 */
	readonly errors: Array<{ path: string; message: string }>;
	/** 設定ファイルのパス */
	readonly configPath?: string;

	constructor(
		errorsOrZodError: ZodError | Array<{ path: string; message: string }>,
		configPath?: string,
	) {
		const errors =
			errorsOrZodError instanceof ZodError
				? errorsOrZodError.errors.map((err) => ({
						path: err.path.join("."),
						message: err.message,
					}))
				: errorsOrZodError;

		const fileName = configPath ?? "設定";
		const errorLines = errors.map((e) => `  - ${e.path}: ${e.message}`);
		const message = `設定ファイルエラー: ${fileName}\n${errorLines.join("\n")}`;

		super(message);
		this.name = "ConfigValidationError";
		this.errors = errors;
		this.configPath = configPath;
	}
}

/**
 * プリセットが見つからないエラー
 */
export class PresetNotFoundError extends Error {
	readonly presetName: string;

	constructor(presetName: string) {
		super(`Preset not found: ${presetName}`);
		this.name = "PresetNotFoundError";
		this.presetName = presetName;
	}
}

/**
 * 設定オブジェクトを検証する
 *
 * @param rawConfig - 検証する生の設定オブジェクト
 * @param configPath - 設定ファイルのパス（エラーメッセージ用）
 * @returns 検証済みの設定オブジェクト
 * @throws {ConfigValidationError} 検証エラー
 */
export function validateConfig(rawConfig: unknown, configPath?: string): OrchestratorConfig {
	try {
		return OrchestratorConfigSchema.parse(rawConfig);
	} catch (error) {
		if (error instanceof ZodError) {
			throw new ConfigValidationError(error, configPath);
		}
		throw error;
	}
}

/**
 * プリセットファイルのパスを解決する
 *
 * 以下の順序で検索:
 * 1. 現在の作業ディレクトリの presets/<name>.yml
 * 2. 現在の作業ディレクトリの presets/<name>.yaml
 * 3. 実行ファイルと同階層の presets/<name>.yml
 * 4. 実行ファイルと同階層の presets/<name>.yaml
 *
 * @param presetName - プリセット名（simple, tdd等）
 * @returns プリセットファイルのパス。見つからない場合はnull
 */
function findPresetPath(presetName: string): string | null {
	const candidates = [`${presetName}.yml`, `${presetName}.yaml`];

	// 1. 現在の作業ディレクトリから検索
	const cwdBaseDir = resolve("presets");
	for (const candidate of candidates) {
		const fullPath = join(cwdBaseDir, candidate);
		if (existsSync(fullPath)) {
			return fullPath;
		}
	}

	// 2. 実行ファイルの場所から検索（バイナリ実行時対応）
	// process.execPath は compiled binary の実際のパスを返す
	const execDir = dirname(process.execPath);
	const execBaseDir = join(execDir, "presets");
	for (const candidate of candidates) {
		const fullPath = join(execBaseDir, candidate);
		if (existsSync(fullPath)) {
			return fullPath;
		}
	}

	return null;
}

/**
 * プリセット設定を読み込む
 *
 * @param presetName - プリセット名
 * @returns プリセット設定（生のオブジェクト）
 * @throws {PresetNotFoundError} プリセットが見つからない場合
 */
export function loadPreset(presetName: string): Record<string, unknown> {
	const presetPath = findPresetPath(presetName);

	if (!presetPath) {
		throw new PresetNotFoundError(presetName);
	}

	const content = readFileSync(presetPath, "utf-8");
	return parseYaml(content) as Record<string, unknown>;
}

/**
 * 設定をマージする（プリセット → ベース設定）
 *
 * プリセットの値がベースになり、ユーザー設定で上書きされる。
 *
 * @param base - ベース設定（ユーザーのorch.yml）
 * @param preset - プリセット設定
 * @returns マージされた設定
 */
function mergeConfig(
	base: Record<string, unknown>,
	preset: Record<string, unknown>,
): Record<string, unknown> {
	// プリセットをベースに、ユーザー設定で上書き
	const result: Record<string, unknown> = { ...preset };

	for (const [key, value] of Object.entries(base)) {
		if (value !== undefined && value !== null) {
			if (typeof value === "object" && !Array.isArray(value) && typeof result[key] === "object") {
				// ネストしたオブジェクトは再帰的にマージ
				result[key] = mergeConfig(
					value as Record<string, unknown>,
					result[key] as Record<string, unknown>,
				);
			} else {
				// プリミティブ値はユーザー設定で上書き
				result[key] = value;
			}
		}
	}

	return result;
}

/**
 * 設定読み込み結果
 */
export interface LoadConfigResult {
	/** 検証済み設定 */
	config: OrchestratorConfig;
	/** Hat定義（プリセットまたは設定ファイルから） */
	hats: Record<string, HatDefinition>;
}

/**
 * Hat定義をパースする
 *
 * @param rawHats - 生のHat定義オブジェクト
 * @returns パース済みのHat定義
 */
function parseHats(rawHats: unknown): Record<string, HatDefinition> {
	if (!rawHats || typeof rawHats !== "object" || Array.isArray(rawHats)) {
		return {};
	}

	const result: Record<string, HatDefinition> = {};

	for (const [id, hatDef] of Object.entries(rawHats as Record<string, unknown>)) {
		try {
			result[id] = HatDefinitionSchema.parse(hatDef);
		} catch {
			// 無効なHat定義は無視（警告を出すこともできる）
			console.warn(`Invalid hat definition for "${id}", skipping`);
		}
	}

	return result;
}

/**
 * 設定ファイルを読み込む
 *
 * @param configPath - 設定ファイルのパス（省略時はデフォルトを検索）
 * @param presetName - プリセット名（CLI引数で指定。省略時は設定ファイルのpresetを使用）
 * @returns 検証済みの設定オブジェクト
 * @throws {ConfigValidationError} 検証エラー
 * @throws {PresetNotFoundError} プリセットが見つからない場合
 */
export function loadConfig(configPath?: string, presetName?: string): OrchestratorConfig {
	return loadConfigWithHats(configPath, presetName).config;
}

/**
 * 設定ファイルとHat定義を読み込む
 *
 * @param configPath - 設定ファイルのパス（省略時はデフォルトを検索）
 * @param presetName - プリセット名（CLI引数で指定。省略時は設定ファイルのpresetを使用）
 * @returns 設定とHat定義
 * @throws {ConfigValidationError} 検証エラー
 * @throws {PresetNotFoundError} プリセットが見つからない場合
 */
export function loadConfigWithHats(configPath?: string, presetName?: string): LoadConfigResult {
	// 設定ファイルの読み込み
	let rawConfig: Record<string, unknown> = {};
	const path = configPath && existsSync(configPath) ? configPath : findConfigFile();

	if (path) {
		const content = readFileSync(path, "utf-8");
		rawConfig = (parseYaml(content) as Record<string, unknown>) ?? {};
	}

	// プリセット名の決定（CLI引数 > 設定ファイル）
	const effectivePresetName = presetName ?? (rawConfig.preset as string | undefined);

	// プリセットが指定されている場合、読み込んでマージ
	if (effectivePresetName) {
		const presetConfig = loadPreset(effectivePresetName);
		rawConfig = mergeConfig(rawConfig, presetConfig);

		// CLI引数でプリセットが指定された場合、その値を強制適用
		// （設定ファイルのpresetがマージで上書きされないようにする）
		if (presetName) {
			rawConfig.preset = presetName;
		}
	}

	// Hat定義を抽出（設定検証前に行う）
	const hats = parseHats(rawConfig.hats);

	// 設定を検証（hatsはOrchestratorConfigSchemaに含まれないので除去）
	const configWithoutHats = { ...rawConfig };
	delete configWithoutHats.hats;

	const config = validateConfig(configWithoutHats, path ?? undefined);

	return { config, hats };
}

function findConfigFile(): string | null {
	const candidates = ["orch.yml", "orch.yaml", ".orch.yml"];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}
