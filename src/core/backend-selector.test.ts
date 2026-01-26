import { describe, it, expect, mock } from "bun:test";
import { BackendSelector } from "./backend-selector.js";
import { Config } from "./types.js";

// モック定義
mock.module("../adapters/gemini.js", () => ({
  GeminiAdapter: class MockGemini {
    name = "gemini";
    execute = mock();
  }
}));

mock.module("../adapters/kiro.js", () => ({
  KiroAdapter: class MockKiro {
    name = "kiro";
    execute = mock();
    constructor(public config: any) {}
  }
}));

mock.module("../adapters/claude.js", () => ({
  ClaudeAdapter: class MockClaude {
    name = "claude";
    execute = mock();
    constructor(public config: any) {}
  }
}));

describe("BackendSelector", () => {
  const baseConfig: Config = {
    version: "1.0",
    backend: { type: "claude" },
    loop: { max_iterations: 1, completion_promise: "DONE", idle_timeout_secs: 1 },
    hats: {}
  } as any;

  it("selectBackend: Hat未定義時はグローバルバックエンドを使用", () => {
    const selector = new BackendSelector(baseConfig);
    const backend = selector.selectBackend("unknown-hat");
    expect(backend.name).toBe("claude");
  });

  it("selectBackend: Hat固有のNamed backend (gemini) を返す", () => {
    const config = { ...baseConfig, hats: { 
      "test-hat": { 
        triggers: [], publishes: [], 
        backend: "gemini" 
      } 
    }} as any;
    const selector = new BackendSelector(config);
    const backend = selector.selectBackend("test-hat");
    expect(backend.name).toBe("gemini");
  });

  it("selectBackend: Hat固有のKiro backendを返す", () => {
    const config = { ...baseConfig, hats: { 
      "kiro-hat": { 
        triggers: [], publishes: [], 
        backend: { type: "kiro", agent: "test-agent" } 
      } 
    }} as any;
    const selector = new BackendSelector(config);
    const backend = selector.selectBackend("kiro-hat");
    expect(backend.name).toBe("kiro");
    expect((backend as any).config.agent).toBe("test-agent");
  });
});
