import { describe, it, expect, mock, beforeEach } from "bun:test";
import { KiroAdapter } from "./kiro.js";
import { ProcessExecutor } from "../core/process-executor.js";

describe("KiroAdapter", () => {
  let executor: ProcessExecutor;
  let adapter: KiroAdapter;

  beforeEach(() => {
    executor = {
      spawn: mock().mockResolvedValue({ stdout: "response", stderr: "", exitCode: 0 }),
    } as any;
    adapter = new KiroAdapter({ agent: "my-agent" }, executor);
  });

  it("kiro-cliコマンドを--agentオプション付きで実行", async () => {
    const response = await adapter.execute("prompt");
    expect(executor.spawn).toHaveBeenCalledWith("kiro-cli", ["--agent", "my-agent", "prompt"]);
    expect(response.output).toBe("response");
  });
  
  it("エラー時は例外をスロー", async () => {
    executor.spawn = mock().mockResolvedValue({ stdout: "", stderr: "error", exitCode: 1 });
    expect(adapter.execute("prompt")).rejects.toThrow();
  });
});
