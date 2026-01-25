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

		// JSON Schema仕様の識別子を確認
		expect(schema.$schema).toContain("json-schema.org");
	});

	it("生成されたスキーマにbackendプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);

		// ConfigSchemaの主要プロパティを確認
		expect(schema.properties.backend).toBeDefined();
	});

	it("生成されたスキーマにloopプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);

		expect(schema.properties.loop).toBeDefined();
	});

	it("生成されたスキーマにsandboxプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);

		// Issue #13で追加されたsandbox設定
		expect(schema.properties.sandbox).toBeDefined();
	});

	it("生成されたスキーマにautoIssueプロパティが含まれる", async () => {
		// スクリプトを実行
		const proc = Bun.spawn(["bun", "run", "scripts/generate-schema.ts"], {
			cwd: process.cwd(),
		});
		await proc.exited;

		const content = await Bun.file(SCHEMA_PATH).text();
		const schema = JSON.parse(content);

		// Issue #13で追加されたautoIssue設定
		expect(schema.properties.autoIssue).toBeDefined();
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
