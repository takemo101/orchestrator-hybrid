/**
 * generate-schema.ts テスト
 *
 * JSON Schema生成スクリプトの動作を検証
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";

const SCHEMA_PATH = "schemas/orch.schema.json";

describe("generate-schema.ts", () => {
	beforeEach(() => {
		// テスト前にスキーマファイルを削除
		if (existsSync(SCHEMA_PATH)) {
			rmSync(SCHEMA_PATH);
		}
	});

	afterEach(() => {
		// テスト後にスキーマファイルをクリーンアップ
		if (existsSync(SCHEMA_PATH)) {
			rmSync(SCHEMA_PATH);
		}
	});

	it("スクリプトを実行するとスキーマファイルが生成される", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		// ファイルが生成されていることを確認
		expect(existsSync(SCHEMA_PATH)).toBe(true);
	});

	it("生成されたスキーマが有効なJSONである", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		// JSONとしてパースできることを確認
		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		expect(schema).toBeDefined();
	});

	it("生成されたスキーマにJSON Schema識別子が含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);

		// JSON Schema仕様の識別子を確認（$refまたは$schemaのいずれか）
		expect(schema.$ref || schema.$schema).toBeDefined();
	});

	/**
	 * スキーマのpropertiesを取得するヘルパー
	 * zodToJsonSchemaは$refとdefinitionsを使用するため
	 */
	function getSchemaProperties(schema: {
		$ref?: string;
		definitions?: Record<string, { properties?: Record<string, unknown> }>;
		properties?: Record<string, unknown>;
	}): Record<string, unknown> {
		// $refを使用している場合はdefinitionsから取得
		if (schema.$ref && schema.definitions) {
			const refName = schema.$ref.replace("#/definitions/", "");
			return schema.definitions[refName]?.properties ?? {};
		}
		// 直接propertiesがある場合
		return schema.properties ?? {};
	}

	it("生成されたスキーマにbackendプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		// ConfigSchemaの主要プロパティを確認
		expect(properties.backend).toBeDefined();
	});

	it("生成されたスキーマにloopプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		expect(properties.loop).toBeDefined();
	});

	it("生成されたスキーマにsandboxプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		// Issue #13で追加されたsandbox設定
		expect(properties.sandbox).toBeDefined();
	});

	it("生成されたスキーマにautoIssueプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		// Issue #13で追加されたautoIssue設定
		expect(properties.autoIssue).toBeDefined();
	});

	it("スクリプトが正常終了する（exit code 0）", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
	});

	it("生成されたスキーマが整形されたJSONである（pretty print）", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();

		// 整形されたJSONは改行とインデントを含む
		expect(content).toContain("\n");
		expect(content).toContain("  "); // 2スペースインデント
	});
});
