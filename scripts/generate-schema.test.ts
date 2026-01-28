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
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		expect(existsSync(SCHEMA_PATH)).toBe(true);
	});

	it("生成されたスキーマが有効なJSONである", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		expect(schema).toBeDefined();
	});

	it("生成されたスキーマにJSON Schema識別子が含まれる", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);

		expect(schema.$ref || schema.$schema).toBeDefined();
	});

	/**
	 * スキーマのpropertiesを取得するヘルパー
	 */
	function getSchemaProperties(schema: {
		$ref?: string;
		definitions?: Record<string, { properties?: Record<string, unknown> }>;
		properties?: Record<string, unknown>;
	}): Record<string, unknown> {
		if (schema.$ref && schema.definitions) {
			const refName = schema.$ref.replace("#/definitions/", "");
			return schema.definitions[refName]?.properties ?? {};
		}
		return schema.properties ?? {};
	}

	it("生成されたスキーマにbackendプロパティが含まれる", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		expect(properties.backend).toBeDefined();
	});

	it("生成されたスキーマにworktreeプロパティが含まれる", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		expect(properties.worktree).toBeDefined();
	});

	it("生成されたスキーマにsessionプロパティが含まれる", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);
		const properties = getSchemaProperties(schema);

		expect(properties.session).toBeDefined();
	});

	it("スクリプトが正常終了する（exit code 0）", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		const exitCode = await proc.exited;

		expect(exitCode).toBe(0);
	});

	it("生成されたスキーマが整形されたJSONである（pretty print）", async () => {
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();

		expect(content).toContain("\n");
		expect(content).toContain("  ");
	});
});
