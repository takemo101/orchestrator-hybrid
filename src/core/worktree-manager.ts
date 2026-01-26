import { join, resolve } from "path";
import { existsSync } from "fs";
import { mkdir, symlink } from "fs/promises";
import { type ProcessExecutor, BunProcessExecutor } from "./process-executor.js";
import { type Worktree } from "./types.js";

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
      const lines = stdout.split("\n");
      const worktrees: Worktree[] = [];
      
      let currentWorktree: Partial<Worktree> = {};
      
      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          if (currentWorktree.path && currentWorktree.branch) {
              const path = currentWorktree.path;
              const loopId = path.split("/").pop() || "";
              if (loopId && path.includes(".worktrees")) {
                  worktrees.push({
                      loopId,
                      path,
                      branch: currentWorktree.branch
                  } as Worktree);
              }
          }
          currentWorktree = { path: line.substring(9).trim() };
        } else if (line.startsWith("branch ")) {
            currentWorktree.branch = line.substring(7).trim().replace("refs/heads/", "");
        } else if (line === "") {
             if (currentWorktree.path && currentWorktree.branch) {
                 const path = currentWorktree.path;
                 const loopId = path.split("/").pop() || "";
                 if (loopId && path.includes(".worktrees")) {
                      worktrees.push({
                          loopId,
                          path,
                          branch: currentWorktree.branch
                      } as Worktree);
                 }
             }
             currentWorktree = {};
        }
      }
      
      if (currentWorktree.path && currentWorktree.branch) {
          const path = currentWorktree.path;
          const loopId = path.split("/").pop() || "";
          if (loopId && path.includes(".worktrees")) {
               worktrees.push({
                   loopId,
                   path,
                   branch: currentWorktree.branch
               } as Worktree);
          }
      }
      
      return worktrees;
    } catch (error) {
      return [];
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
    } catch(e) {
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
     } catch (e) {
         return false;
     }
  }
}
