#!/usr/bin/env bun
/**
 * JSON Schema生成スクリプト
 *
 * ConfigSchemaからJSON Schemaを自動生成し、schemas/orch.schema.jsonに出力する。
 * 生成されたスキーマはVSCodeなどのエディタで設定ファイルの補完に使用できる。
 *
 * @example
 * ```bash
 * bun run scripts/generate-schema.ts
 * # または
 * bun run generate:schema
 * ```
 *
 * @module
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ConfigSchema } from "../src/core/types.js";

const OUTPUT_PATH = "schemas/orch.schema.json";

/**
 * JSON Schemaを生成してファイルに出力
 */
async function main(): Promise<void> {
	// zodスキーマからJSON Schemaを生成
	const jsonSchema = zodToJsonSchema(ConfigSchema, {
		name: "OrchConfig",
		$refStrategy: "none", // $refを使用せずインライン展開
	});

	// 出力ディレクトリを作成（存在しない場合）
	await mkdir(dirname(OUTPUT_PATH), { recursive: true });

	// JSON Schemaをファイルに出力（整形済み）
	await Bun.write(OUTPUT_PATH, JSON.stringify(jsonSchema, null, 2));

	console.log(`[OK] JSON Schema generated: ${OUTPUT_PATH}`);
}

// スクリプト実行
main().catch((error) => {
	console.error("[ERROR] Failed to generate JSON Schema:", error);
	process.exit(1);
});
