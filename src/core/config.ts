import { existsSync, readFileSync } from "node:fs";
import { ZodError } from "zod";
import { parse as parseYaml } from "yaml";
import { type Config, ConfigSchema } from "./types.js";

const DEFAULT_CONFIG_NAME = "orch.yml";

/**
 * 設定ファイル検証エラー
 *
 * zodスキーマ検証で発生したエラーを、ユーザーフレンドリーな形式で提供する。
 */
export class ConfigValidationError extends Error {
	/**
	 * 個別のエラー情報
	 */
	readonly errors: Array<{ path: string; message: string }>;

	/**
	 * 設定ファイルのパス（指定された場合）
	 */
	readonly configPath?: string;

	constructor(zodError: ZodError, configPath?: string) {
		const errors = zodError.errors.map((err) => ({
			path: err.path.join("."),
			message: err.message,
		}));

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
 * @param configPath - 設定ファイルのパス（エラーメッセージ用、オプション）
 * @returns 検証済みの設定オブジェクト
 * @throws {ConfigValidationError} 検証エラーが発生した場合
 *
 * @example
 * ```ts
 * try {
 *   const config = validateConfig(rawConfig, "orch.yml");
 * } catch (error) {
 *   if (error instanceof ConfigValidationError) {
 *     console.error(error.message);
 *     // 設定ファイルエラー: orch.yml
 *     //   - backend.type: Invalid enum value...
 *   }
 * }
 * ```
 */
export function validateConfig(rawConfig: unknown, configPath?: string): Config {
	try {
		return ConfigSchema.parse(rawConfig);
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
 * @param configPath - 設定ファイルのパス（オプション）
 * @returns 検証済みの設定オブジェクト
 * @throws {ConfigValidationError} 設定ファイルの検証エラー
 */
export function loadConfig(configPath?: string): Config {
	const path = configPath ?? findConfigFile();

	if (!path) {
		return getDefaultConfig();
	}

	const content = readFileSync(path, "utf-8");
	const raw = parseYaml(content);
	return validateConfig(raw, path);
}

function findConfigFile(): string | null {
	const candidates = [DEFAULT_CONFIG_NAME, "orch.yaml", ".orch.yml"];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

function getDefaultConfig(): Config {
	return ConfigSchema.parse({
		version: "1.0",
		backend: { type: "claude" },
		loop: {
			max_iterations: 100,
			completion_promise: "LOOP_COMPLETE",
			idle_timeout_secs: 1800,
		},
	});
}
