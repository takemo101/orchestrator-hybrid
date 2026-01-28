import { describe, expect, test, beforeEach } from "bun:test";
import { HatSystem, HatError, extractEventFromOutput, BUILTIN_HATS } from "./hat.js";
import type { HatDefinition } from "./types.js";

describe("HatSystem", () => {
	describe("constructor", () => {
		test("空のHat定義で初期化できる", () => {
			const system = new HatSystem({});
			expect(system.getAllHats()).toEqual([]);
		});

		test("Hat定義を渡して初期化できる", () => {
			const definitions: Record<string, HatDefinition> = {
				tester: {
					name: "Tester",
					triggers: ["task.start"],
					publishes: ["tests.failing"],
					instructions: "テストを書く",
				},
			};
			const system = new HatSystem(definitions);
			expect(system.getAllHats()).toHaveLength(1);
		});

		test("複数のHat定義を渡して初期化できる", () => {
			const definitions: Record<string, HatDefinition> = {
				tester: {
					name: "Tester",
					triggers: ["task.start"],
					publishes: ["tests.failing"],
					instructions: "テストを書く",
				},
				implementer: {
					name: "Implementer",
					triggers: ["tests.failing"],
					publishes: ["code.written"],
					instructions: "実装する",
				},
			};
			const system = new HatSystem(definitions);
			expect(system.getAllHats()).toHaveLength(2);
		});
	});

	describe("findHatByTrigger", () => {
		let system: HatSystem;

		beforeEach(() => {
			const definitions: Record<string, HatDefinition> = {
				tester: {
					name: "Tester",
					triggers: ["task.start", "code.written"],
					publishes: ["tests.failing", "tests.passing"],
					instructions: "テストを書く",
				},
				implementer: {
					name: "Implementer",
					triggers: ["tests.failing"],
					publishes: ["code.written"],
					instructions: "実装する",
				},
				refactorer: {
					name: "Refactorer",
					triggers: ["tests.passing"],
					publishes: ["LOOP_COMPLETE"],
					instructions: "リファクタリングする",
				},
			};
			system = new HatSystem(definitions);
		});

		test("トリガーに一致するHatを返す", () => {
			const hat = system.findHatByTrigger("tests.failing");
			expect(hat).not.toBeNull();
			expect(hat?.name).toBe("Implementer");
		});

		test("複数のトリガーを持つHatを見つけられる", () => {
			const hat1 = system.findHatByTrigger("task.start");
			const hat2 = system.findHatByTrigger("code.written");
			expect(hat1?.name).toBe("Tester");
			expect(hat2?.name).toBe("Tester");
		});

		test("一致するHatがない場合nullを返す", () => {
			const hat = system.findHatByTrigger("unknown.event");
			expect(hat).toBeNull();
		});

		test("空のトピックに対してnullを返す", () => {
			const hat = system.findHatByTrigger("");
			expect(hat).toBeNull();
		});
	});

	describe("getAllHats", () => {
		test("全てのHat定義を返す", () => {
			const definitions: Record<string, HatDefinition> = {
				tester: {
					name: "Tester",
					triggers: ["task.start"],
					publishes: ["tests.failing"],
					instructions: "テストを書く",
				},
				implementer: {
					name: "Implementer",
					triggers: ["tests.failing"],
					publishes: ["code.written"],
					instructions: "実装する",
				},
			};
			const system = new HatSystem(definitions);
			const hats = system.getAllHats();
			expect(hats).toHaveLength(2);
			expect(hats.map((h) => h.name).sort()).toEqual(["Implementer", "Tester"]);
		});

		test("空のシステムでは空配列を返す", () => {
			const system = new HatSystem({});
			expect(system.getAllHats()).toEqual([]);
		});
	});

	describe("getHat", () => {
		test("IDでHatを取得できる", () => {
			const definitions: Record<string, HatDefinition> = {
				tester: {
					name: "Tester",
					triggers: ["task.start"],
					publishes: ["tests.failing"],
					instructions: "テストを書く",
				},
			};
			const system = new HatSystem(definitions);
			const hat = system.getHat("tester");
			expect(hat?.name).toBe("Tester");
		});

		test("存在しないIDの場合undefinedを返す", () => {
			const system = new HatSystem({});
			const hat = system.getHat("nonexistent");
			expect(hat).toBeUndefined();
		});
	});
});

describe("extractEventFromOutput", () => {
	test("EVENT: キーワードからイベントを抽出する", () => {
		const output = "何らかの処理をしました\nEVENT: tests.failing\n終了";
		const event = extractEventFromOutput(output);
		expect(event).toBe("tests.failing");
	});

	test("EVENT:の後に空白がある場合も抽出できる", () => {
		const output = "EVENT:   tests.passing  ";
		const event = extractEventFromOutput(output);
		expect(event).toBe("tests.passing");
	});

	test("LOOP_COMPLETEを抽出できる", () => {
		const output = "タスク完了しました\nEVENT: LOOP_COMPLETE\n";
		const event = extractEventFromOutput(output);
		expect(event).toBe("LOOP_COMPLETE");
	});

	test("小文字のevent:でも抽出できる", () => {
		const output = "event: code.written";
		const event = extractEventFromOutput(output);
		expect(event).toBe("code.written");
	});

	test("大文字小文字混合のEvent:でも抽出できる", () => {
		const output = "Event: tests.failing";
		const event = extractEventFromOutput(output);
		expect(event).toBe("tests.failing");
	});

	test("イベントがない場合nullを返す", () => {
		const output = "通常のログメッセージ\n終了しました";
		const event = extractEventFromOutput(output);
		expect(event).toBeNull();
	});

	test("空の出力に対してnullを返す", () => {
		const event = extractEventFromOutput("");
		expect(event).toBeNull();
	});

	test("複数のイベントがある場合、最後のものを返す", () => {
		const output = "EVENT: first.event\n処理中...\nEVENT: second.event";
		const event = extractEventFromOutput(output);
		expect(event).toBe("second.event");
	});

	test("LOOP_COMPLETEがEVENT:なしで出現しても検出する", () => {
		const output = "作業完了しました。LOOP_COMPLETE";
		const event = extractEventFromOutput(output);
		expect(event).toBe("LOOP_COMPLETE");
	});

	test("loop_completeを検出する(小文字)", () => {
		const output = "loop_complete";
		const event = extractEventFromOutput(output);
		expect(event).toBe("LOOP_COMPLETE");
	});
});

describe("HatError", () => {
	test("メッセージ付きでエラーを作成できる", () => {
		const error = new HatError("Hat not found");
		expect(error.message).toBe("Hat not found");
		expect(error.name).toBe("HatError");
	});

	test("hatId付きでエラーを作成できる", () => {
		const error = new HatError("Hat error", { hatId: "tester" });
		expect(error.hatId).toBe("tester");
	});

	test("causeを含むエラーを作成できる", () => {
		const cause = new Error("original error");
		const error = new HatError("Hat error", { cause });
		expect(error.cause).toBe(cause);
	});
});

describe("BUILTIN_HATS", () => {
	test("testerが定義されている", () => {
		expect(BUILTIN_HATS.tester).toBeDefined();
		expect(BUILTIN_HATS.tester.name).toContain("Tester");
		expect(BUILTIN_HATS.tester.triggers).toContain("task.start");
	});

	test("implementerが定義されている", () => {
		expect(BUILTIN_HATS.implementer).toBeDefined();
		expect(BUILTIN_HATS.implementer.name).toContain("Implementer");
		expect(BUILTIN_HATS.implementer.triggers).toContain("tests.failing");
	});

	test("refactorerが定義されている", () => {
		expect(BUILTIN_HATS.refactorer).toBeDefined();
		expect(BUILTIN_HATS.refactorer.name).toContain("Refactorer");
		expect(BUILTIN_HATS.refactorer.triggers).toContain("tests.passing");
	});

	test("各Hatがtriggersとpublishesを持つ", () => {
		for (const [id, hat] of Object.entries(BUILTIN_HATS)) {
			expect(hat.triggers.length).toBeGreaterThan(0);
			expect(hat.publishes.length).toBeGreaterThan(0);
			expect(hat.instructions).toBeTruthy();
		}
	});
});
