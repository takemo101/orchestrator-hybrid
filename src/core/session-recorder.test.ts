import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { SessionRecorder } from "./session-recorder.js";

const testDir = ".test-session-recorder";
const testFile = `${testDir}/session.jsonl`;

beforeEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("SessionRecorder", () => {
	test("記録を開始するとファイルが作成される", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();

		const content = await readFile(testFile, "utf-8");
		expect(content).toBe("");

		await recorder.stopRecording();
	});

	test("イテレーションを記録するとJSONL形式で追記される", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();

		await recorder.recordIteration(1, "planner", "prompt1", "output1", ["plan.ready"]);
		await recorder.recordIteration(2, "implementer", "prompt2", "output2", ["code.written"]);

		await recorder.stopRecording();

		const content = await readFile(testFile, "utf-8");
		const lines = content.trim().split("\n");

		expect(lines).toHaveLength(2);

		const record1 = JSON.parse(lines[0]);
		expect(record1.iteration).toBe(1);
		expect(record1.hat).toBe("planner");
		expect(record1.prompt).toBe("prompt1");
		expect(record1.output).toBe("output1");
		expect(record1.events).toEqual(["plan.ready"]);
		expect(record1.timestamp).toBeDefined();

		const record2 = JSON.parse(lines[1]);
		expect(record2.iteration).toBe(2);
		expect(record2.hat).toBe("implementer");
	});

	test("記録開始前にrecordIterationを呼ぶと何も記録されない", async () => {
		const recorder = new SessionRecorder(testFile);

		await recorder.recordIteration(1, "planner", "prompt", "output", []);

		try {
			await readFile(testFile, "utf-8");
			expect(true).toBe(false);
		} catch (error) {
			expect((error as NodeJS.ErrnoException).code).toBe("ENOENT");
		}
	});

	test("stopRecording後はisRecordingがfalseになる", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();
		await recorder.recordIteration(1, "planner", "prompt", "output", []);
		await recorder.stopRecording();

		await recorder.recordIteration(2, "implementer", "prompt2", "output2", []);

		const content = await readFile(testFile, "utf-8");
		const lines = content.trim().split("\n");
		expect(lines).toHaveLength(1);
	});

	test("複数のイベントを記録できる", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();

		await recorder.recordIteration(1, "reviewer", "prompt", "output", [
			"review.approved",
			"LOOP_COMPLETE",
		]);

		await recorder.stopRecording();

		const content = await readFile(testFile, "utf-8");
		const record = JSON.parse(content.trim());

		expect(record.events).toEqual(["review.approved", "LOOP_COMPLETE"]);
	});
});
