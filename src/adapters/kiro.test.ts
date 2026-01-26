import { describe, expect, it } from "bun:test";
import type { ProcessExecutor } from "../core/process-executor.js";
import { KiroAdapter } from "./kiro.js";

describe("KiroAdapter", () => {
	it("kiro-cliコマンドを--agentオプション付きで実行", async () => {
		let calledCmd = "";
		let calledArgs: string[] = [];
		const executor: ProcessExecutor = {
			spawn: async (cmd: string, args: string[]) => {
				calledCmd = cmd;
				calledArgs = args;
				return { stdout: "response", stderr: "", exitCode: 0 };
			},
		};
		const adapter = new KiroAdapter({ agent: "my-agent" }, executor);

		const response = await adapter.execute("prompt");

		expect(calledCmd).toBe("kiro-cli");
		expect(calledArgs).toEqual(["--agent", "my-agent", "prompt"]);
		expect(response.output).toBe("response");
	});

	it("エラー時は例外をスロー", async () => {
		const executor: ProcessExecutor = {
			spawn: async () => ({ stdout: "", stderr: "error", exitCode: 1 }),
		};
		const adapter = new KiroAdapter({ agent: "my-agent" }, executor);

		let error: Error | null = null;
		try {
			await adapter.execute("prompt");
		} catch (e) {
			error = e as Error;
		}

		expect(error).not.toBeNull();
		expect(error?.message).toContain("Kiro実行失敗");
	});
});
