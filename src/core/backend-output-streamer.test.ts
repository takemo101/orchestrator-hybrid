import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { BackendOutputStreamer } from "./backend-output-streamer.js";

const TEST_DIR = ".test-backend-output";
const TEST_LOG_PATH = `${TEST_DIR}/backend.log`;

describe("BackendOutputStreamer", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
		mkdirSync(TEST_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
	});

	describe("constructor", () => {
		it("ログファイルパスを設定してインスタンスを作成する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
			});

			expect(streamer).toBeDefined();
			streamer.close();
		});

		it("存在しないディレクトリを自動作成する", () => {
			const nestedPath = `${TEST_DIR}/nested/dir/backend.log`;
			const streamer = new BackendOutputStreamer({
				logPath: nestedPath,
			});

			streamer.writeStdout("Test");
			streamer.close();

			expect(existsSync(nestedPath)).toBe(true);
		});
	});

	describe("writeStdout", () => {
		it("stdoutデータを[stdout]タグ付きで書き込む", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("Hello, World!");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stdout] Hello, World!");
		});

		it("複数回の書き込みを正しく処理する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("Line 1");
			streamer.writeStdout("Line 2");
			streamer.writeStdout("Line 3");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stdout] Line 1");
			expect(content).toContain("[stdout] Line 2");
			expect(content).toContain("[stdout] Line 3");
		});

		it("Bufferデータを正しく処理する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout(Buffer.from("Buffer data"));
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stdout] Buffer data");
		});
	});

	describe("writeStderr", () => {
		it("stderrデータを[stderr]タグ付きで書き込む", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStderr("Error occurred");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stderr] Error occurred");
		});

		it("Bufferデータを正しく処理する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStderr(Buffer.from("Error buffer"));
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stderr] Error buffer");
		});
	});

	describe("タイムスタンプ", () => {
		it("includeTimestamp: trueでISO 8601形式のタイムスタンプを付与する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: true,
			});

			streamer.writeStdout("Test");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			// ISO 8601形式: [2026-01-26T10:00:00.123Z]
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
		});

		it("includeTimestamp: false（デフォルト）でタイムスタンプを付与しない", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("Test");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).not.toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
		});

		it("デフォルトでタイムスタンプを付与する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
			});

			streamer.writeStdout("Test");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			// デフォルトはtrue
			expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
		});
	});

	describe("stdout/stderrの混在", () => {
		it("stdoutとstderrを交互に書き込んで順序を保持する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("stdout 1");
			streamer.writeStderr("stderr 1");
			streamer.writeStdout("stdout 2");
			streamer.writeStderr("stderr 2");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			const lines = content.trim().split("\n");

			expect(lines[0]).toContain("[stdout] stdout 1");
			expect(lines[1]).toContain("[stderr] stderr 1");
			expect(lines[2]).toContain("[stdout] stdout 2");
			expect(lines[3]).toContain("[stderr] stderr 2");
		});
	});

	describe("close", () => {
		it("バッファをフラッシュしてファイルを閉じる", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("Before close");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stdout] Before close");
		});

		it("close後の書き込みは無視される", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("Before close");
			streamer.close();
			streamer.writeStdout("After close"); // これは無視される

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stdout] Before close");
			expect(content).not.toContain("After close");
		});

		it("複数回closeを呼んでもエラーにならない", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
			});

			streamer.writeStdout("Test");
			streamer.close();
			streamer.close();
			streamer.close();

			// エラーが発生しなければOK
			expect(true).toBe(true);
		});
	});

	describe("改行処理", () => {
		it("改行を含むデータを正しく処理する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("Line 1\nLine 2\nLine 3");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			expect(content).toContain("[stdout] Line 1\nLine 2\nLine 3");
		});

		it("空文字列を無視する", () => {
			const streamer = new BackendOutputStreamer({
				logPath: TEST_LOG_PATH,
				includeTimestamp: false,
			});

			streamer.writeStdout("");
			streamer.writeStdout("Valid");
			streamer.close();

			const content = readFileSync(TEST_LOG_PATH, "utf-8");
			const lines = content
				.trim()
				.split("\n")
				.filter((l) => l);
			expect(lines.length).toBe(1);
			expect(lines[0]).toContain("[stdout] Valid");
		});
	});
});
