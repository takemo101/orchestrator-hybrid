import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { LogWriter } from "./log-writer.js";

describe("LogWriter", () => {
	const testTaskId = "test-task-123";
	const testBaseDir = ".agent-test";
	const testLogDir = join(testBaseDir, testTaskId);

	beforeEach(() => {
		// テスト用ディレクトリをクリーンアップ
		if (existsSync(testBaseDir)) {
			rmSync(testBaseDir, { recursive: true });
		}
	});

	afterEach(() => {
		// テスト後のクリーンアップ
		if (existsSync(testBaseDir)) {
			rmSync(testBaseDir, { recursive: true });
		}
	});

	describe("constructor", () => {
		test("taskIdとbaseDirで初期化できる", () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			expect(writer.getLogDir()).toBe(testLogDir);
		});

		test("baseDirがない場合はデフォルトで.agentが使われる", () => {
			const writer = new LogWriter({ taskId: testTaskId });
			expect(writer.getLogDir()).toBe(join(".agent", testTaskId));
		});
	});

	describe("initialize()", () => {
		test("ディレクトリが作成される", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();

			expect(existsSync(testLogDir)).toBe(true);
		});

		test("複数回呼んでもエラーにならない", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();
			await writer.initialize();

			expect(existsSync(testLogDir)).toBe(true);
		});
	});

	describe("writeStdout()", () => {
		test("stdout.logとoutput.logに書き込まれる", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();

			await writer.writeStdout("test output\n");

			const stdoutContent = await Bun.file(join(testLogDir, "stdout.log")).text();
			const outputContent = await Bun.file(join(testLogDir, "output.log")).text();

			expect(stdoutContent).toBe("test output\n");
			expect(outputContent).toBe("test output\n");
		});

		test("複数回書き込むと追記される", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();

			await writer.writeStdout("line1\n");
			await writer.writeStdout("line2\n");

			const stdoutContent = await Bun.file(join(testLogDir, "stdout.log")).text();
			expect(stdoutContent).toBe("line1\nline2\n");
		});

		test("initialize()前に呼ぶとエラー", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });

			await expect(writer.writeStdout("test")).rejects.toThrow("LogWriter not initialized");
		});
	});

	describe("writeStderr()", () => {
		test("stderr.logとoutput.logに書き込まれる", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();

			await writer.writeStderr("test error\n");

			const stderrContent = await Bun.file(join(testLogDir, "stderr.log")).text();
			const outputContent = await Bun.file(join(testLogDir, "output.log")).text();

			expect(stderrContent).toBe("test error\n");
			expect(outputContent).toBe("test error\n");
		});

		test("initialize()前に呼ぶとエラー", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });

			await expect(writer.writeStderr("test")).rejects.toThrow(
				"LogWriter not initialized",
			);
		});
	});

	describe("writeOutput()", () => {
		test("output.logのみに書き込まれる", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();

			await writer.writeOutput("generic message\n");

			const outputContent = await Bun.file(join(testLogDir, "output.log")).text();
			expect(outputContent).toBe("generic message\n");

			// stdout.logとstderr.logには書き込まれない
			const stdoutExists = await Bun.file(join(testLogDir, "stdout.log")).exists();
			const stderrExists = await Bun.file(join(testLogDir, "stderr.log")).exists();
			expect(stdoutExists).toBe(false);
			expect(stderrExists).toBe(false);
		});

		test("initialize()前に呼ぶとエラー", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });

			await expect(writer.writeOutput("test")).rejects.toThrow(
				"LogWriter not initialized",
			);
		});
	});

	describe("stdout/stderr/output の混合書き込み", () => {
		test("output.logに全ての出力がマージされる", async () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			await writer.initialize();

			await writer.writeStdout("stdout1\n");
			await writer.writeStderr("stderr1\n");
			await writer.writeOutput("output1\n");
			await writer.writeStdout("stdout2\n");

			const outputContent = await Bun.file(join(testLogDir, "output.log")).text();
			expect(outputContent).toBe("stdout1\nstderr1\noutput1\nstdout2\n");
		});
	});

	describe("getLogDir()", () => {
		test("ログディレクトリのパスを返す", () => {
			const writer = new LogWriter({ taskId: testTaskId, baseDir: testBaseDir });
			expect(writer.getLogDir()).toBe(testLogDir);
		});
	});
});
