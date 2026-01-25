import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { findTaskLogPath, readLastNLines } from "./cli-logs.js";
import { LogWriter } from "./core/log-writer.js";

const TEST_BASE_DIR = ".test-cli-logs";
const TEST_TASK_ID = "test-task-cli-123";

describe("cli-logs ヘルパー関数", () => {
	beforeEach(async () => {
		await mkdir(TEST_BASE_DIR, { recursive: true });
	});

	afterEach(async () => {
		await rm(TEST_BASE_DIR, { recursive: true, force: true });
	});

	describe("findTaskLogPath", () => {
		test("存在するタスクのログパスを返す", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("test\n");

			const logPath = await findTaskLogPath(TEST_TASK_ID, TEST_BASE_DIR);
			expect(logPath).toBe(join(TEST_BASE_DIR, TEST_TASK_ID, "output.log"));
		});

		test("存在しないタスクの場合はnullを返す", async () => {
			const logPath = await findTaskLogPath("nonexistent-task", TEST_BASE_DIR);
			expect(logPath).toBeNull();
		});

		test("ディレクトリが存在してもログファイルがない場合はnullを返す", async () => {
			await mkdir(join(TEST_BASE_DIR, TEST_TASK_ID), { recursive: true });
			const logPath = await findTaskLogPath(TEST_TASK_ID, TEST_BASE_DIR);
			expect(logPath).toBeNull();
		});
	});

	describe("readLastNLines", () => {
		test("最後のN行を読み取る", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			for (let i = 1; i <= 10; i++) {
				await writer.writeOutput(`line${i}\n`);
			}

			const logPath = join(TEST_BASE_DIR, TEST_TASK_ID, "output.log");
			const lines = await readLastNLines(logPath, 3);
			expect(lines).toEqual(["line8", "line9", "line10"]);
		});

		test("ファイルの行数がN未満の場合は全行を返す", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			await writer.writeOutput("only1\n");
			await writer.writeOutput("only2\n");

			const logPath = join(TEST_BASE_DIR, TEST_TASK_ID, "output.log");
			const lines = await readLastNLines(logPath, 10);
			expect(lines).toEqual(["only1", "only2"]);
		});

		test("空のファイルの場合は空配列を返す", async () => {
			const logDir = join(TEST_BASE_DIR, TEST_TASK_ID);
			await mkdir(logDir, { recursive: true });
			const logPath = join(logDir, "output.log");
			await Bun.write(logPath, "");

			const lines = await readLastNLines(logPath, 10);
			expect(lines).toEqual([]);
		});

		test("linesが指定されない場合はデフォルトの100行を返す", async () => {
			const writer = new LogWriter({
				taskId: TEST_TASK_ID,
				baseDir: TEST_BASE_DIR,
			});
			await writer.initialize();
			for (let i = 1; i <= 150; i++) {
				await writer.writeOutput(`line${i}\n`);
			}

			const logPath = join(TEST_BASE_DIR, TEST_TASK_ID, "output.log");
			const lines = await readLastNLines(logPath);
			expect(lines.length).toBe(100);
			expect(lines[0]).toBe("line51");
			expect(lines[99]).toBe("line150");
		});
	});
});
