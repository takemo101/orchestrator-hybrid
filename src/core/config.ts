import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { ZodError } from "zod";
import { type OrchestratorConfig, OrchestratorConfigSchema } from "./types.js";

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
 * 設定ファイルを読み込む
 *
 * @param configPath - 設定ファイルのパス
 * @returns 検証済みの設定オブジェクト
 * @throws {ConfigValidationError} 検証エラー
 */
export function loadConfig(configPath?: string): OrchestratorConfig {
	if (configPath && !existsSync(configPath)) {
		return getDefaultConfig();
	}

	const path = configPath ?? findConfigFile();

	if (!path) {
		return getDefaultConfig();
	}

	const content = readFileSync(path, "utf-8");
	const raw = parseYaml(content);
	return validateConfig(raw, path);
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

function getDefaultConfig(): OrchestratorConfig {
	return OrchestratorConfigSchema.parse({});
}
