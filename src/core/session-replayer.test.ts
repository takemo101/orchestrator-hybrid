import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { SessionRecorder } from "./session-recorder.js";
import { SessionReplayer } from "./session-replayer.js";

const testDir = ".test-session-replayer";
const testFile = `${testDir}/session.jsonl`;

beforeEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

afterEach(async () => {
	await rm(testDir, { recursive: true, force: true });
});

describe("SessionReplayer", () => {
	test("記録されたセッションをリプレイできる", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();
		await recorder.recordIteration(1, "planner", "prompt1", "output1", ["plan.ready"]);
		await recorder.recordIteration(2, "implementer", "prompt2", "output2", ["code.written"]);
		await recorder.stopRecording();

		const replayer = new SessionReplayer(testFile);
		const result = await replayer.replay();

		expect(result.success).toBe(true);
		expect(result.iterations).toBe(2);
		expect(result.errors).toHaveLength(0);
	});

	test("ファイルが存在しない場合はエラーを返す", async () => {
		const replayer = new SessionReplayer("non-existent.jsonl");
		const result = await replayer.replay();

		expect(result.success).toBe(false);
		expect(result.iterations).toBe(0);
		expect(result.errors).toHaveLength(1);
		expect(result.errors[0]).toContain("セッション記録ファイルが見つかりません");
	});

	test("loadRecordsでレコード配列を取得できる", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();
		await recorder.recordIteration(1, "planner", "prompt1", "output1", ["plan.ready"]);
		await recorder.recordIteration(2, "implementer", "prompt2", "output2", []);
		await recorder.stopRecording();

		const replayer = new SessionReplayer(testFile);
		const records = await replayer.loadRecords();

		expect(records).toHaveLength(2);
		expect(records[0].iteration).toBe(1);
		expect(records[0].hat).toBe("planner");
		expect(records[1].iteration).toBe(2);
		expect(records[1].hat).toBe("implementer");
	});

	test("空のセッションファイルをリプレイできる", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();
		await recorder.stopRecording();

		const replayer = new SessionReplayer(testFile);
		const result = await replayer.replay();

		expect(result.success).toBe(true);
		expect(result.iterations).toBe(0);
	});

	test("複数のイベントを持つレコードをリプレイできる", async () => {
		const recorder = new SessionRecorder(testFile);
		await recorder.startRecording();
		await recorder.recordIteration(1, "reviewer", "prompt", "output", [
			"review.approved",
			"LOOP_COMPLETE",
		]);
		await recorder.stopRecording();

		const replayer = new SessionReplayer(testFile);
		const result = await replayer.replay();

		expect(result.success).toBe(true);
		expect(result.iterations).toBe(1);
	});
});
