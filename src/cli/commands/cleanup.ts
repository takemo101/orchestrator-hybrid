/**
 * cleanupコマンド
 *
 * 放置されたworktree、Dockerコンテナ、ブランチを掃除する
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Command } from "commander";
import { logger } from "../../core/logger.js";
import type { CommandHandler } from "./types.js";

export interface CleanupCommandOptions {
	all?: boolean;
	worktrees?: boolean;
	containers?: boolean;
	branches?: boolean;
	dryRun?: boolean;
}

interface CleanupResult {
	worktrees: string[];
	containers: string[];
	branches: string[];
}

export class CleanupCommand implements CommandHandler {
	register(program: Command): void {
		program
			.command("cleanup")
			.description("Clean up orphaned worktrees, Docker containers, and branches")
			.option("-a, --all", "Clean up everything (worktrees, containers, branches)")
			.option("-w, --worktrees", "Clean up orphaned worktrees only")
			.option("-c, --containers", "Clean up orch Docker containers only")
			.option("-b, --branches", "Clean up orphaned feature branches only")
			.option("-n, --dry-run", "Show what would be cleaned up without actually doing it")
			.action(async (options: CleanupCommandOptions) => {
				try {
					await this.execute(options);
				} catch (error) {
					logger.error(error instanceof Error ? error.message : String(error));
					process.exit(1);
				}
			});
	}

	async execute(options: CleanupCommandOptions): Promise<CleanupResult> {
		const result: CleanupResult = {
			worktrees: [],
			containers: [],
			branches: [],
		};

		const cleanAll =
			options.all || (!options.worktrees && !options.containers && !options.branches);
		const dryRun = options.dryRun ?? false;

		if (dryRun) {
			logger.info("Dry run mode - no changes will be made\n");
		}

		if (cleanAll || options.worktrees) {
			result.worktrees = await this.cleanupWorktrees(dryRun);
		}

		if (cleanAll || options.containers) {
			result.containers = await this.cleanupContainers(dryRun);
		}

		if (cleanAll || options.branches) {
			result.branches = await this.cleanupBranches(dryRun);
		}

		this.printSummary(result, dryRun);
		return result;
	}

	private async cleanupWorktrees(dryRun: boolean): Promise<string[]> {
		logger.info("Checking worktrees...");
		const cleaned: string[] = [];

		try {
			const worktreesDir = path.join(process.cwd(), ".worktrees");

			if (!fs.existsSync(worktreesDir)) {
				logger.info("  No .worktrees directory found");
				return cleaned;
			}

			const entries = fs.readdirSync(worktreesDir);
			const worktreeDirs = entries.filter((entry) => {
				const fullPath = path.join(worktreesDir, entry);
				return fs.statSync(fullPath).isDirectory() && entry.startsWith("issue-");
			});

			if (worktreeDirs.length === 0) {
				logger.info("  No orphaned worktrees found");
				return cleaned;
			}

			for (const dir of worktreeDirs) {
				const fullPath = path.join(worktreesDir, dir);

				if (dryRun) {
					logger.info(`  Would remove: ${fullPath}`);
				} else {
					try {
						execSync(`git worktree remove "${fullPath}" --force`, { stdio: "pipe" });
						logger.success(`  Removed worktree: ${dir}`);
					} catch {
						fs.rmSync(fullPath, { recursive: true, force: true });
						logger.success(`  Removed directory: ${dir}`);
					}
				}
				cleaned.push(dir);
			}

			if (!dryRun && fs.existsSync(path.join(worktreesDir, "worktrees.json"))) {
				fs.unlinkSync(path.join(worktreesDir, "worktrees.json"));
				logger.info("  Removed worktrees.json");
			}

			if (!dryRun) {
				try {
					execSync("git worktree prune", { stdio: "pipe" });
					logger.info("  Pruned stale worktree references");
				} catch {}
			}
		} catch (error) {
			logger.warn(
				`  Error cleaning worktrees: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return cleaned;
	}

	private async cleanupContainers(dryRun: boolean): Promise<string[]> {
		logger.info("Checking Docker containers...");
		const cleaned: string[] = [];

		try {
			const result = execSync("docker ps -a --format '{{.ID}}\\t{{.Image}}\\t{{.Names}}'", {
				encoding: "utf-8",
			});

			const lines = result.trim().split("\n").filter(Boolean);
			const orchContainers = lines.filter((line) => {
				const [, image] = line.split("\t");
				return image === "node:20-alpine" || image === "node:20";
			});

			if (orchContainers.length === 0) {
				logger.info("  No orch Docker containers found");
				return cleaned;
			}

			for (const line of orchContainers) {
				const [id, image, name] = line.split("\t");

				if (dryRun) {
					logger.info(`  Would remove: ${name || id} (${image})`);
				} else {
					try {
						execSync(`docker rm -f ${id}`, { stdio: "pipe" });
						logger.success(`  Removed container: ${name || id}`);
					} catch (error) {
						logger.warn(
							`  Failed to remove container ${id}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
				cleaned.push(name || id);
			}
		} catch (error) {
			if ((error as Error).message?.includes("command not found")) {
				logger.info("  Docker not available");
			} else {
				logger.warn(
					`  Error checking containers: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		return cleaned;
	}

	private async cleanupBranches(dryRun: boolean): Promise<string[]> {
		logger.info("Checking orphaned branches...");
		const cleaned: string[] = [];

		try {
			const result = execSync("git branch --list 'feature/issue-*'", {
				encoding: "utf-8",
			});

			const branches = result
				.trim()
				.split("\n")
				.map((b) => b.trim().replace(/^\* /, ""))
				.filter(Boolean);

			if (branches.length === 0) {
				logger.info("  No orphaned feature branches found");
				return cleaned;
			}

			const currentBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();

			for (const branch of branches) {
				if (branch === currentBranch) {
					logger.info(`  Skipping current branch: ${branch}`);
					continue;
				}

				if (dryRun) {
					logger.info(`  Would delete: ${branch}`);
				} else {
					try {
						execSync(`git branch -D "${branch}"`, { stdio: "pipe" });
						logger.success(`  Deleted branch: ${branch}`);
					} catch (error) {
						logger.warn(
							`  Failed to delete branch ${branch}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
				cleaned.push(branch);
			}
		} catch (error) {
			logger.warn(
				`  Error cleaning branches: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		return cleaned;
	}

	private printSummary(result: CleanupResult, dryRun: boolean): void {
		const total = result.worktrees.length + result.containers.length + result.branches.length;

		console.log("");
		if (total === 0) {
			logger.success("Nothing to clean up!");
		} else if (dryRun) {
			logger.info(
				`Would clean up: ${result.worktrees.length} worktrees, ${result.containers.length} containers, ${result.branches.length} branches`,
			);
			logger.info("Run without --dry-run to actually clean up");
		} else {
			logger.success(
				`Cleaned up: ${result.worktrees.length} worktrees, ${result.containers.length} containers, ${result.branches.length} branches`,
			);
		}
	}
}

export const cleanupCommand = new CleanupCommand();
