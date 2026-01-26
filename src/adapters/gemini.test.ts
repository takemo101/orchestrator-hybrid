import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ProcessExecutor } from "../core/process-executor.js";
import { GeminiAdapter } from "./gemini.js";

describe("GeminiAdapter", () => {
	let executor: ProcessExecutor;
	let adapter: GeminiAdapter;

	beforeEach(() => {
		executor = {
			spawn: mock().mockResolvedValue({ stdout: "response", stderr: "", exitCode: 0 }),
		} as any;
		adapter = new GeminiAdapter(executor);
	});

	it("geminiコマンドを実行", async () => {
		const response = await adapter.execute("prompt");
		expect(executor.spawn).toHaveBeenCalledWith("gemini", ["prompt"]);
		expect(response.output).toBe("response");
	});

	it("エラー時は例外をスロー", async () => {
		executor.spawn = mock().mockResolvedValue({ stdout: "", stderr: "error", exitCode: 1 });
		expect(adapter.execute("prompt")).rejects.toThrow();
	});
});
