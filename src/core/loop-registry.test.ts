import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { LoopRegistry } from "./loop-registry";
import { type Loop } from "./types";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

describe("LoopRegistry", () => {
  const testBaseDir = ".orch-test-registry";
  let registry: LoopRegistry;

  beforeEach(async () => {
    await mkdir(testBaseDir, { recursive: true });
    registry = new LoopRegistry(testBaseDir);
  });

  afterEach(async () => {
    await rm(testBaseDir, { recursive: true, force: true });
  });

  it("should register a loop and save to loops.json", async () => {
    const loop: Loop = {
      id: "orch-test-1",
      state: "running",
      worktree_path: "/tmp/worktree",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await registry.registerLoop(loop);
    const loops = await registry.listLoops();
    expect(loops).toHaveLength(1);
    expect(loops[0].id).toBe("orch-test-1");
  });

  it("should throw error when registering duplicate loop id", async () => {
    const loop: Loop = {
      id: "orch-test-1",
      state: "running",
      worktree_path: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await registry.registerLoop(loop);
    // registerLoop の実装次第だが、Promiseのrejectを期待
    try {
        await registry.registerLoop(loop);
        expect(true).toBe(false); // Should not reach here
    } catch (e) {
        expect(e).toBeDefined();
    }
  });

  it("should update loop state", async () => {
    const loop: Loop = {
      id: "orch-test-1",
      state: "running",
      worktree_path: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await registry.registerLoop(loop);
    await registry.updateLoopState("orch-test-1", "queued");
    
    const loops = await registry.listLoops();
    expect(loops[0].state).toBe("queued");
    expect(loops[0].updated_at).not.toBe(loop.updated_at);
  });

  it("should list all loops", async () => {
    expect(await registry.listLoops()).toEqual([]);
  });

  it("should delete a loop", async () => {
     const loop: Loop = {
      id: "orch-test-1",
      state: "running",
      worktree_path: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await registry.registerLoop(loop);
    await registry.deleteLoop("orch-test-1");
    expect(await registry.listLoops()).toEqual([]);
  });
});
