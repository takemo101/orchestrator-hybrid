import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { LogMonitor, type ISessionManager, type LogOptions } from "./log-monitor.js";

/**
 * モックSessionManager
 */
function createMockSessionManager(overrides: Partial<ISessionManager> = {}): ISessionManager {
	return {
		getOutput: vi.fn().mockResolvedValue(""),
		streamOutput: vi.fn().mockImplementation(async function* () {
			// デフォルトは空のストリーム
		}),
		isRunning: vi.fn().mockResolvedValue(true),
		...overrides,
	};
}

/**
 * モックWriter
 */
function createMockWriter() {
	const chunks: string[] = [];
	return {
		write: (data: string) => {
			chunks.push(data);
		},
		getOutput: () => chunks.join(""),
		getChunks: () => chunks,
	};
}

describe("LogMonitor", () => {
	describe("showLogs", () => {
		it("過去のログを表示する（follow: false）", async () => {
			const mockOutput = "line 1\nline 2\nline 3\n";
			const sessionManager = createMockSessionManager({
				getOutput: vi.fn().mockResolvedValue(mockOutput),
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await monitor.showLogs("orch-42", { follow: false, lines: 100 });

			expect(sessionManager.getOutput).toHaveBeenCalledWith("orch-42", 100);
			expect(writer.getOutput()).toBe(mockOutput);
		});

		it("空の出力でもエラーにならない", async () => {
			const sessionManager = createMockSessionManager({
				getOutput: vi.fn().mockResolvedValue(""),
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await expect(
				monitor.showLogs("orch-42", { follow: false, lines: 100 }),
			).resolves.not.toThrow();
		});

		it("linesオプションに従って行数を指定する", async () => {
			const sessionManager = createMockSessionManager();
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await monitor.showLogs("orch-42", { follow: false, lines: 50 });

			expect(sessionManager.getOutput).toHaveBeenCalledWith("orch-42", 50);
		});

		it("follow: trueで過去ログを表示後、ストリーミングを開始する", async () => {
			const pastLogs = "past log\n";
			const streamChunks = ["chunk1\n", "chunk2\n"];

			async function* mockStream() {
				for (const chunk of streamChunks) {
					yield chunk;
				}
			}

			const sessionManager = createMockSessionManager({
				getOutput: vi.fn().mockResolvedValue(pastLogs),
				streamOutput: vi.fn().mockImplementation(mockStream),
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await monitor.showLogs("orch-42", { follow: true, lines: 100 });

			expect(writer.getChunks()).toEqual([pastLogs, "chunk1\n", "chunk2\n"]);
		});
	});

	describe("stop", () => {
		it("ストリーミングを中断できる", async () => {
			let yieldCount = 0;

			async function* infiniteStream() {
				while (true) {
					yieldCount++;
					yield `chunk ${yieldCount}\n`;
					// 中断を検出するための短い待機
					await new Promise((resolve) => setTimeout(resolve, 10));
				}
			}

			const sessionManager = createMockSessionManager({
				getOutput: vi.fn().mockResolvedValue(""),
				streamOutput: vi.fn().mockImplementation(infiniteStream),
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			// 非同期でshowLogsを開始
			const logsPromise = monitor.showLogs("orch-42", { follow: true, lines: 0 });

			// 少し待ってからstopを呼ぶ
			await new Promise((resolve) => setTimeout(resolve, 50));
			monitor.stop();

			// showLogsが完了するのを待つ
			await logsPromise;

			// いくつかのchunkは出力されているが、無限には続かない
			expect(yieldCount).toBeGreaterThan(0);
			expect(yieldCount).toBeLessThan(100);
		});

		it("stopを複数回呼んでもエラーにならない", () => {
			const sessionManager = createMockSessionManager();
			const monitor = new LogMonitor(sessionManager);

			expect(() => {
				monitor.stop();
				monitor.stop();
			}).not.toThrow();
		});
	});

	describe("エラーハンドリング", () => {
		it("getOutputがエラーをスローした場合、例外が伝播する", async () => {
			const sessionManager = createMockSessionManager({
				getOutput: vi.fn().mockRejectedValue(new Error("Session not found")),
			});
			const monitor = new LogMonitor(sessionManager);

			await expect(monitor.showLogs("orch-999", { follow: false, lines: 100 })).rejects.toThrow(
				"Session not found",
			);
		});

		it("streamOutputがエラーをスローした場合、例外が伝播する", async () => {
			async function* errorStream() {
				yield "first chunk\n";
				throw new Error("Stream error");
			}

			const sessionManager = createMockSessionManager({
				getOutput: vi.fn().mockResolvedValue(""),
				streamOutput: vi.fn().mockImplementation(errorStream),
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await expect(monitor.showLogs("orch-42", { follow: true, lines: 0 })).rejects.toThrow(
				"Stream error",
			);
		});
	});
});
