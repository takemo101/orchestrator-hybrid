/**
 * プリセット読み込みユーティリティ
 *
 * v2.0.0 F-102: CLIリファクタリング
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import type { Config } from "../../core/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PRESETS_DIR = join(__dirname, "..", "..", "..", "presets");

/**
 * プリセット情報
 */
export interface PresetInfo {
	name: string;
	description: string;
}

/**
 * 利用可能なプリセット一覧
 */
export const AVAILABLE_PRESETS: PresetInfo[] = [
	{ name: "simple", description: "Basic loop without hats (default)" },
	{
		name: "tdd",
		description: "Test-Driven Development (Tester → Implementer → Refactorer)",
	},
	{
		name: "spec-driven",
		description: "Specification-driven (Planner → Builder → Reviewer)",
	},
];

/**
 * プリセット設定を読み込む
 *
 * @param name - プリセット名
 * @returns 設定オブジェクト
 * @throws プリセットが見つからない場合
 */
export function loadPreset(name: string): Config {
	const presetPath = getPresetPath(name);

	if (!existsSync(presetPath)) {
		throw new Error(`Preset not found: ${name}. Use --list-presets to see available presets.`);
	}

	const content = readFileSync(presetPath, "utf-8");
	return parseYaml(content);
}

/**
 * プリセットファイルのパスを取得する
 *
 * @param name - プリセット名
 * @returns ファイルパス
 */
export function getPresetPath(name: string): string {
	const candidates = [
		join(PRESETS_DIR, `${name}.yml`),
		join(PRESETS_DIR, `${name}.yaml`),
		join(process.cwd(), "presets", `${name}.yml`),
		join(process.cwd(), "presets", `${name}.yaml`),
	];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return candidates[0];
}

/**
 * プリセットが存在するかチェックする
 *
 * @param name - プリセット名
 * @returns 存在する場合true
 */
export function presetExists(name: string): boolean {
	return existsSync(getPresetPath(name));
}

/**
 * プリセットファイルの内容を読み込む
 *
 * @param name - プリセット名
 * @returns ファイル内容
 */
export function readPresetContent(name: string): string {
	const presetPath = getPresetPath(name);

	if (!existsSync(presetPath)) {
		throw new Error(`Preset not found: ${name}`);
	}

	return readFileSync(presetPath, "utf-8");
}
