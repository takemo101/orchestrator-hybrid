import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LogMonitorError } from "./errors.js";
import { LogMonitor } from "./log-monitor.js";

describe("LogMonitor", () => {
	const testDir = ".test-agent-logmonitor";
	const taskId = "test-task-123";
	const logDir = join(testDir, taskId);
	const logPath = join(logDir, "output.log");

	beforeEach(async () => {
		await mkdir(logDir, { recursive: true });
		await writeFile(logPath, "initial line\n");
	});

	afterEach(async () => {
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
			expect(monitor.getLogPath()).toBe(join(".agent", taskId, "output.log"));
		});

		it("usePollingオプションを指定できる", () => {
			const monitor = new LogMonitor({ taskId, usePolling: true });
			expect(monitor.getLogPath()).toBe(join(".agent", taskId, "output.log"));
		});
	});

	describe("monitor", () => {
		it("ファイルが存在しない場合はLogMonitorErrorをスローする", async () => {
			const monitor = new LogMonitor({
				taskId: "nonexistent",
				baseDir: testDir,
				usePolling: true,
			});

			await expect(monitor.monitor(() => {})).rejects.toThrow(LogMonitorError);
		});

		it("ファイル存在時に監視を開始できる（pollingモード）", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
				pollInterval: 30,
				usePolling: true,
			});
			const lines: string[] = [];

			const monitorPromise = monitor.monitor((line) => {
				lines.push(line);
			});

			await new Promise((resolve) => setTimeout(resolve, 50));
			await appendFile(logPath, "new line 1\n");
			await new Promise((resolve) => setTimeout(resolve, 100));

			monitor.stop();
			await monitorPromise;

			expect(lines).toContain("new line 1");
		});

		it("stop()で監視を即座に停止できる", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
				pollInterval: 30,
				usePolling: true,
			});

			const monitorPromise = monitor.monitor(() => {});
			await new Promise((resolve) => setTimeout(resolve, 10));
			monitor.stop();

			await expect(monitorPromise).resolves.toBeUndefined();
		});

		it("複数行を追加した場合、すべての行がコールバックで通知される", async () => {
			const monitor = new LogMonitor({
				taskId,
				baseDir: testDir,
				pollInterval: 30,
				usePolling: true,
			});
			const lines: string[] = [];

			const monitorPromise = monitor.monitor((line) => {
				lines.push(line);
			});

			await new Promise((resolve) => setTimeout(resolve, 50));
			await appendFile(logPath, "line 1\nline 2\nline 3\n");
			await new Promise((resolve) => setTimeout(resolve, 100));

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
				pollInterval: 30,
				usePolling: true,
			});
			const lines: string[] = [];

			const monitorPromise = monitor.monitor((line) => {
				lines.push(line);
			});

			await new Promise((resolve) => setTimeout(resolve, 50));
			await appendFile(logPath, "line 1\n\n\nline 2\n");
			await new Promise((resolve) => setTimeout(resolve, 100));

			monitor.stop();
			await monitorPromise;

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
