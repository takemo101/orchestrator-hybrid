import { describe, expect, test } from "bun:test";
import {
	BUILTIN_PRESETS,
	getPreset,
	listPresets,
	mergeConfigs,
	PresetError,
	PresetLoader,
} from "./preset.js";
import type { OrchestratorConfig } from "./types.js";

describe("PresetLoader", () => {
	describe("listPresets", () => {
		test("利用可能なプリセット一覧を返す", () => {
			const loader = new PresetLoader();
			const presets = loader.listPresets();
			expect(presets).toContain("simple");
			expect(presets).toContain("tdd");
		});

		test("少なくとも2つのプリセットが存在する", () => {
			const loader = new PresetLoader();
			const presets = loader.listPresets();
			expect(presets.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("loadPreset", () => {
		test("simpleプリセットを読み込める", () => {
			const loader = new PresetLoader();
			const preset = loader.loadPreset("simple");
			expect(preset).toBeDefined();
			expect(preset.hats).toEqual({});
		});

		test("tddプリセットを読み込める", () => {
			const loader = new PresetLoader();
			const preset = loader.loadPreset("tdd");
			expect(preset).toBeDefined();
			expect(preset.hats).toBeDefined();
			expect(preset.hats?.tester).toBeDefined();
			expect(preset.hats?.implementer).toBeDefined();
			expect(preset.hats?.refactorer).toBeDefined();
		});

		test("存在しないプリセットでPresetErrorをスローする", () => {
			const loader = new PresetLoader();
			expect(() => loader.loadPreset("nonexistent")).toThrow(PresetError);
		});

		test("エラーメッセージにプリセット名が含まれる", () => {
			const loader = new PresetLoader();
			try {
				loader.loadPreset("invalid-preset");
			} catch (error) {
				expect((error as PresetError).message).toContain("invalid-preset");
				expect((error as PresetError).presetName).toBe("invalid-preset");
			}
		});
	});

	describe("getPresetDescription", () => {
		test("simpleプリセットの説明を取得できる", () => {
			const loader = new PresetLoader();
			const description = loader.getPresetDescription("simple");
			expect(description).toBeTruthy();
		});

		test("tddプリセットの説明を取得できる", () => {
			const loader = new PresetLoader();
			const description = loader.getPresetDescription("tdd");
			expect(description).toBeTruthy();
			// 日本語説明「テスト駆動開発」を含むことを確認
			expect(description).toContain("テスト駆動開発");
		});

		test("存在しないプリセットでPresetErrorをスローする", () => {
			const loader = new PresetLoader();
			expect(() => loader.getPresetDescription("nonexistent")).toThrow(PresetError);
		});
	});
});

describe("BUILTIN_PRESETS", () => {
	test("simpleプリセットが定義されている", () => {
		expect(BUILTIN_PRESETS.simple).toBeDefined();
		expect(BUILTIN_PRESETS.simple.name).toBe("simple");
	});

	test("tddプリセットが定義されている", () => {
		expect(BUILTIN_PRESETS.tdd).toBeDefined();
		expect(BUILTIN_PRESETS.tdd.name).toBe("tdd");
	});

	test("simpleプリセットはHatなし", () => {
		expect(BUILTIN_PRESETS.simple.config.hats).toEqual({});
	});

	test("tddプリセットは3つのHatを含む", () => {
		const hats = BUILTIN_PRESETS.tdd.config.hats;
		expect(hats).toBeDefined();
		expect(Object.keys(hats!).length).toBe(3);
		expect(hats!.tester).toBeDefined();
		expect(hats!.implementer).toBeDefined();
		expect(hats!.refactorer).toBeDefined();
	});

	test("各プリセットは必須フィールドを持つ", () => {
		for (const [name, preset] of Object.entries(BUILTIN_PRESETS)) {
			expect(preset.name).toBe(name);
			expect(preset.description).toBeTruthy();
			expect(preset.config).toBeDefined();
		}
	});
});

describe("mergeConfigs", () => {
	test("ベース設定とプリセット設定をマージする", () => {
		const base: Partial<OrchestratorConfig> = {
			backend: "claude",
			max_iterations: 50,
		};
		const preset: Partial<OrchestratorConfig> = {
			max_iterations: 100,
		};
		const result = mergeConfigs(base, preset);
		// base の値が優先される
		expect(result.backend).toBe("claude");
		expect(result.max_iterations).toBe(50);
	});

	test("ベース設定にない値はプリセットから取得する", () => {
		const base: Partial<OrchestratorConfig> = {
			backend: "claude",
		};
		const preset: Partial<OrchestratorConfig> = {
			max_iterations: 100,
			auto: true,
		};
		const result = mergeConfigs(base, preset);
		expect(result.backend).toBe("claude");
		expect(result.max_iterations).toBe(100);
		expect(result.auto).toBe(true);
	});

	test("空のベース設定ではプリセットの値がそのまま使われる", () => {
		const base: Partial<OrchestratorConfig> = {};
		const preset: Partial<OrchestratorConfig> = {
			backend: "opencode",
			max_iterations: 200,
		};
		const result = mergeConfigs(base, preset);
		expect(result.backend).toBe("opencode");
		expect(result.max_iterations).toBe(200);
	});

	test("両方空の場合は空オブジェクトを返す", () => {
		const result = mergeConfigs({}, {});
		expect(result).toEqual({});
	});
});

describe("getPreset", () => {
	test("プリセット名からプリセット設定を取得できる", () => {
		const preset = getPreset("simple");
		expect(preset).toBeDefined();
		expect(preset.name).toBe("simple");
	});

	test("tddプリセットを取得できる", () => {
		const preset = getPreset("tdd");
		expect(preset).toBeDefined();
		expect(preset.name).toBe("tdd");
	});

	test("存在しないプリセットでPresetErrorをスローする", () => {
		expect(() => getPreset("invalid")).toThrow(PresetError);
	});
});

describe("listPresets", () => {
	test("プリセット名の配列を返す", () => {
		const presets = listPresets();
		expect(Array.isArray(presets)).toBe(true);
		expect(presets).toContain("simple");
		expect(presets).toContain("tdd");
	});
});

describe("PresetError", () => {
	test("メッセージ付きでエラーを作成できる", () => {
		const error = new PresetError("Preset not found");
		expect(error.message).toBe("Preset not found");
		expect(error.name).toBe("PresetError");
	});

	test("presetName付きでエラーを作成できる", () => {
		const error = new PresetError("Preset error", { presetName: "invalid" });
		expect(error.presetName).toBe("invalid");
	});

	test("causeを含むエラーを作成できる", () => {
		const cause = new Error("original error");
		const error = new PresetError("Preset error", { cause });
		expect(error.cause).toBe(cause);
	});
});
