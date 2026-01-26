import { existsSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BunProcessExecutor } from "./bun-process-executor.js";
import type { ProcessExecutor } from "./process-executor.js";
import type { Worktree } from "./types.js";

export class WorktreeManager {
  private baseDir: string;
  private worktreesDir: string;
  private executor: ProcessExecutor;

  constructor(baseDir: string = process.cwd(), executor?: ProcessExecutor) {
    this.baseDir = resolve(baseDir);
    this.worktreesDir = join(this.baseDir, ".worktrees");
    this.executor = executor || new BunProcessExecutor();
  }

  async listWorktrees(): Promise<Worktree[]> {
    try {
      const { stdout } = await this.executor.exec(["git", "worktree", "list", "--porcelain"]);
      return this.parseWorktreeOutput(stdout);
    } catch (_error) {
      return [];
    }
  }

  private parseWorktreeOutput(output: string): Worktree[] {
      const lines = output.split("\n");
      const worktrees: Worktree[] = [];
      
      let currentWorktree: Partial<Worktree> = {};
      
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          this.addWorktreeIfValid(worktrees, currentWorktree);
          currentWorktree = { path: line.substring(9).trim() };
        } else if (line.startsWith("branch ")) {
            currentWorktree.branch = line.substring(7).trim().replace("refs/heads/", "");
        } else if (line === "") {
             this.addWorktreeIfValid(worktrees, currentWorktree);
             currentWorktree = {};
        }
      }
      this.addWorktreeIfValid(worktrees, currentWorktree);
      
      return worktrees;
  }

  private addWorktreeIfValid(worktrees: Worktree[], current: Partial<Worktree>) {
      if (current.path && current.branch) {
          const path = current.path;
          const loopId = path.split("/").pop() || "";
          if (loopId && path.includes(".worktrees")) {
              worktrees.push({
                  loopId,
                  path,
                  branch: current.branch
              } as Worktree);
          }
      }
  }

  async createWorktree(loopId: string): Promise<string> {
    const worktreePath = join(this.worktreesDir, loopId);
    const branchName = `loop/${loopId}`;

    if (!existsSync(this.worktreesDir)) {
      await mkdir(this.worktreesDir, { recursive: true });
    }

    await this.executor.exec([
      "git",
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
      "main"
    ]);

    const agentDir = join(worktreePath, ".agent");
    if (!existsSync(agentDir)) {
      await mkdir(agentDir, { recursive: true });
    }

    const primaryMemoriesPath = join(this.baseDir, ".agent", "memories.md");
    const targetMemoriesPath = join(agentDir, "memories.md");

    try {
        if (existsSync(primaryMemoriesPath)) {
             if (!existsSync(targetMemoriesPath)) {
                 await symlink(primaryMemoriesPath, targetMemoriesPath);
             }
        }
    } catch(_e) {
        // ignore
    }

    return worktreePath;
  }

  async removeWorktree(loopId: string): Promise<void> {
    const worktreePath = join(this.worktreesDir, loopId);
    await this.executor.exec(["git", "worktree", "remove", "--force", worktreePath]);
    
    const branchName = `loop/${loopId}`;
    await this.executor.exec(["git", "branch", "-D", branchName]);
  }

  async mergeWorktree(loopId: string): Promise<boolean> {
     const branchName = `loop/${loopId}`;
     try {
         await this.executor.exec(["git", "merge", "--no-ff", branchName]);
         return true;
     } catch (_e) {
         return false;
     }
  }
}
