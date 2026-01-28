import { describe, expect, mock, test } from "bun:test";
import { type ISessionManager, LogMonitor } from "./log-monitor.js";

/**
 * モックSessionManager
 */
function createMockSessionManager(overrides: Partial<ISessionManager> = {}): ISessionManager {
	return {
		getOutput: mock(() => Promise.resolve("")),
		streamOutput: mock(async function* () {
			// デフォルトは空のストリーム
		}),
		isRunning: mock(() => Promise.resolve(true)),
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
		test("過去のログを表示する（follow: false）", async () => {
			const mockOutput = "line 1\nline 2\nline 3\n";
			const getOutputMock = mock(() => Promise.resolve(mockOutput));
			const sessionManager = createMockSessionManager({
				getOutput: getOutputMock,
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await monitor.showLogs("orch-42", { follow: false, lines: 100 });

			expect(getOutputMock).toHaveBeenCalledWith("orch-42", 100);
			expect(writer.getOutput()).toBe(mockOutput);
		});

		test("空の出力でもエラーにならない", async () => {
			const sessionManager = createMockSessionManager({
				getOutput: mock(() => Promise.resolve("")),
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			// エラーなく完了することを確認
			await monitor.showLogs("orch-42", { follow: false, lines: 100 });
			expect(writer.getOutput()).toBe("");
		});

		test("linesオプションに従って行数を指定する", async () => {
			const getOutputMock = mock(() => Promise.resolve(""));
			const sessionManager = createMockSessionManager({
				getOutput: getOutputMock,
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await monitor.showLogs("orch-42", { follow: false, lines: 50 });

			expect(getOutputMock).toHaveBeenCalledWith("orch-42", 50);
		});

		test("follow: trueで過去ログを表示後、ストリーミングを開始する", async () => {
			const pastLogs = "past log\n";
			const streamChunks = ["chunk1\n", "chunk2\n"];

			async function* mockStream() {
				for (const chunk of streamChunks) {
					yield chunk;
				}
			}

			const sessionManager = createMockSessionManager({
				getOutput: mock(() => Promise.resolve(pastLogs)),
				streamOutput: mockStream,
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await monitor.showLogs("orch-42", { follow: true, lines: 100 });

			expect(writer.getChunks()).toEqual([pastLogs, "chunk1\n", "chunk2\n"]);
		});
	});

	describe("stop", () => {
		test("ストリーミングを中断できる", async () => {
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
				getOutput: mock(() => Promise.resolve("")),
				streamOutput: infiniteStream,
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

		test("stopを複数回呼んでもエラーにならない", () => {
			const sessionManager = createMockSessionManager();
			const monitor = new LogMonitor(sessionManager);

			expect(() => {
				monitor.stop();
				monitor.stop();
			}).not.toThrow();
		});
	});

	describe("エラーハンドリング", () => {
		test("getOutputがエラーをスローした場合、例外が伝播する", async () => {
			const sessionManager = createMockSessionManager({
				getOutput: mock(() => Promise.reject(new Error("Session not found"))),
			});
			const monitor = new LogMonitor(sessionManager);

			await expect(monitor.showLogs("orch-999", { follow: false, lines: 100 })).rejects.toThrow(
				"Session not found",
			);
		});

		test("streamOutputがエラーをスローした場合、例外が伝播する", async () => {
			async function* errorStream() {
				yield "first chunk\n";
				throw new Error("Stream error");
			}

			const sessionManager = createMockSessionManager({
				getOutput: mock(() => Promise.resolve("")),
				streamOutput: errorStream,
			});
			const writer = createMockWriter();
			const monitor = new LogMonitor(sessionManager, writer);

			await expect(monitor.showLogs("orch-42", { follow: true, lines: 0 })).rejects.toThrow(
				"Stream error",
			);
		});
	});
});
