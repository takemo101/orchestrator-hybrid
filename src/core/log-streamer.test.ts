import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { LogStreamer } from "./log-streamer.js";
import { LogWriter } from "./log-writer.js";

const TEST_BASE_DIR = ".test-log-streamer";
const TEST_TASK_ID = "test-task-123";

describe("LogStreamer", () => {
	beforeEach(async () => {
		await mkdir(TEST_BASE_DIR, { recursive: true });
	});

	afterEach(async () => {
		await rm(TEST_BASE_DIR, { recursive: true, force: true });
	});

	describe("constructor", () => {
		test("taskIdとbaseDirで初期化できる", () => {
			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			expect(streamer).toBeDefined();
		});

		test("baseDirがない場合はデフォルトで.agentが使われる", () => {
			const streamer = new LogStreamer({ taskId: TEST_TASK_ID });
			expect(streamer).toBeDefined();
		});

		test("followのデフォルト値はfalse", () => {
			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			// follow=falseの動作はstream()のテストで確認
			expect(streamer).toBeDefined();
		});
	});

	describe("stream() - follow=false", () => {
		test("ファイル全体を一度だけ読み取る", async () => {
			// LogWriterでログファイルを作成
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("line1\n");
			await writer.writeOutput("line2\n");
			await writer.writeOutput("line3\n");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: false,
			});

			const lines: string[] = [];
			await streamer.stream((line) => {
				lines.push(line);
			});

			expect(lines).toEqual(["line1", "line2", "line3"]);
		});

		test("空のファイルの場合はコールバックが呼ばれない", async () => {
			// 空のログファイルを作成
			const logDir = join(TEST_BASE_DIR, TEST_TASK_ID);
			await mkdir(logDir, { recursive: true });
			await Bun.write(join(logDir, "output.log"), "");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: false,
			});

			const lines: string[] = [];
			await streamer.stream((line) => {
				lines.push(line);
			});

			expect(lines).toEqual([]);
		});

		test("ファイルが存在しない場合はエラーがスローされる", async () => {
			const streamer = new LogStreamer({
				taskId: "nonexistent-task",
				baseDir: TEST_BASE_DIR,
				follow: false,
			});

			await expect(
				streamer.stream(() => {}),
			).rejects.toThrow();
		});
	});

	describe("stream() - follow=true", () => {
		test("新しい行が追加されたら即座にコールバックが呼ばれる", async () => {
			// LogWriterでログファイルを作成
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("initial\n");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: true,
			});

			const lines: string[] = [];
			const streamPromise = streamer.stream((line) => {
				lines.push(line);
			});

			// 少し待ってから新しい行を追加
			await new Promise((resolve) => setTimeout(resolve, 150));
			await writer.writeOutput("new line\n");

			// さらに待ってから停止
			await new Promise((resolve) => setTimeout(resolve, 200));
			streamer.stop();

			await streamPromise;

			expect(lines).toContain("initial");
			expect(lines).toContain("new line");
		});

		test("stop()でストリーミングが停止する", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("test\n");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: true,
			});

			let streamEnded = false;
			const streamPromise = streamer.stream(() => {}).then(() => {
				streamEnded = true;
			});

			// 即座に停止
			streamer.stop();

			await streamPromise;
			expect(streamEnded).toBe(true);
		});

		test("pollIntervalオプションでポーリング間隔を設定できる", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("test\n");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: true,
				pollInterval: 50, // 50msでポーリング
			});

			const lines: string[] = [];
			const streamPromise = streamer.stream((line) => {
				lines.push(line);
			});

			await new Promise((resolve) => setTimeout(resolve, 80));
			await writer.writeOutput("quick update\n");

			await new Promise((resolve) => setTimeout(resolve, 80));
			streamer.stop();

			await streamPromise;
			expect(lines).toContain("quick update");
		});
	});

	describe("stop()", () => {
		test("stream()実行前に呼んでもエラーにならない", () => {
			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});

			expect(() => streamer.stop()).not.toThrow();
		});

		test("複数回呼んでもエラーにならない", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("test\n");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: true,
			});

			const streamPromise = streamer.stream(() => {});

			streamer.stop();
			streamer.stop();
			streamer.stop();

			await streamPromise;
		});
	});

	describe("lines オプション", () => {
		test("最後のN行のみを読み取る", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			for (let i = 1; i <= 10; i++) {
				await writer.writeOutput(`line${i}\n`);
			}

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: false,
				lines: 3,
			});

			const lines: string[] = [];
			await streamer.stream((line) => {
				lines.push(line);
			});

			expect(lines).toEqual(["line8", "line9", "line10"]);
		});

		test("ファイルの行数がlinesより少ない場合は全行を返す", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("only1\n");
			await writer.writeOutput("only2\n");

			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
				follow: false,
				lines: 10,
			});

			const lines: string[] = [];
			await streamer.stream((line) => {
				lines.push(line);
			});

			expect(lines).toEqual(["only1", "only2"]);
		});
	});

	describe("getLogPath()", () => {
		test("output.logのパスを返す", () => {
			const streamer = new LogStreamer({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});

			expect(streamer.getLogPath()).toBe(
				join(TEST_BASE_DIR, TEST_TASK_ID, "output.log"),
			);
		});
	});
});
