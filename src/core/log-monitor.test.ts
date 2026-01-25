import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, writeFile, appendFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { LogMonitor, type LogMonitorConfig } from "./log-monitor.js";
import { LogMonitorError } from "./errors.js";

describe("LogMonitor", () => {
	const testDir = ".test-agent";
	const taskId = "test-task-123";
	const logDir = join(testDir, taskId);
	const logPath = join(logDir, "output.log");

	beforeEach(async () => {
		// テスト用ディレクトリとファイルを作成
		await mkdir(logDir, { recursive: true });
		await writeFile(logPath, "initial line\n");
	});

	afterEach(async () => {
		// クリーンアップ
		await rm(testDir, { recursive: true, force: true });
	});

	describe("constructor", () => {
		it("デフォルト設定で初期化できる", () => {
			const monitor = new LogMonitor({ taskId });
			expect(monitor.getLogPath()).toBe(join(".agent", taskId, "output.log"));
		});

		it("カスタムbaseDirで初期化できる", () => {
			const monitor = new LogMonitor({ taskId, baseDir: testDir });
			expect(monitor.getLogPath()).toBe(logPath);
		});

		it("カスタムpollIntervalで初期化できる", () => {
			const monitor = new LogMonitor({ taskId, pollInterval: 1000 });
			// pollIntervalはprivateなので直接テストできないが、初期化は成功する
			expect(monitor.getLogPath()).toBe(join(".agent", taskId, "output.log"));
		});
	});

	describe("monitor", () => {
		it("ファイルが存在しない場合はLogMonitorErrorをスローする", async () => {
			const monitor = new LogMonitor({
				taskId: "nonexistent",
				baseDir: testDir,
			});

			await expect(monitor.monitor(() => {})).rejects.toThrow(LogMonitorError);
		});

		it("ファイル存在時に監視を開始できる", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
				pollInterval: 100,
			});
			const lines: string[] = [];

			// 非同期で監視開始
			const monitorPromise = monitor.monitor((line) => {
				lines.push(line);
			});

			// 少し待ってから新しい行を追加
			await new Promise((resolve) => setTimeout(resolve, 100));
			await appendFile(logPath, "new line 1\n");
			await new Promise((resolve) => setTimeout(resolve, 200)); // polling間隔待ち

			// 監視停止
			monitor.stop();
			await monitorPromise;

			expect(lines).toContain("new line 1");
		});

		it("stop()で監視を停止できる", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
			});

			const monitorPromise = monitor.monitor(() => {});

			// すぐに停止
			monitor.stop();

			// エラーなく終了することを確認
			await expect(monitorPromise).resolves.toBeUndefined();
		});

		it("複数行を追加した場合、すべての行がコールバックで通知される", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
				pollInterval: 50,
			});
			const lines: string[] = [];

			const monitorPromise = monitor.monitor((line) => {
				lines.push(line);
			});

			await new Promise((resolve) => setTimeout(resolve, 100));
			await appendFile(logPath, "line 1\nline 2\nline 3\n");
			await new Promise((resolve) => setTimeout(resolve, 150));

			monitor.stop();
			await monitorPromise;

			expect(lines).toContain("line 1");
			expect(lines).toContain("line 2");
			expect(lines).toContain("line 3");
		});

		it("空行はスキップされる", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
				pollInterval: 50,
			});
			const lines: string[] = [];

			const monitorPromise = monitor.monitor((line) => {
				lines.push(line);
			});

			await new Promise((resolve) => setTimeout(resolve, 100));
			await appendFile(logPath, "line 1\n\n\nline 2\n");
			await new Promise((resolve) => setTimeout(resolve, 150));

			monitor.stop();
			await monitorPromise;

			// 空行はフィルタされている
			expect(lines.filter((l) => l === "")).toHaveLength(0);
			expect(lines).toContain("line 1");
			expect(lines).toContain("line 2");
		});
	});

	describe("getLogPath", () => {
		it("正しいログパスを返す", () => {
			const monitor = new LogMonitor({ taskId, baseDir: testDir });
			expect(monitor.getLogPath()).toBe(logPath);
		});
	});

	describe("stop", () => {
		it("stop()を複数回呼んでも安全", () => {
			const monitor = new LogMonitor({ taskId, baseDir: testDir });
			// エラーが発生しないことを確認
			expect(() => {
				monitor.stop();
				monitor.stop();
				monitor.stop();
			}).not.toThrow();
		});

		it("monitor()を呼ぶ前にstop()を呼んでも安全", () => {
			const monitor = new LogMonitor({ taskId, baseDir: testDir });
			expect(() => {
				monitor.stop();
			}).not.toThrow();
		});
	});
});
