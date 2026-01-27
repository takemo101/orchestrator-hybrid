import * as path from "node:path";
import type { WorktreeConfig, WorktreeInfo } from "../core/types";
import type { WorktreeManager } from "./worktree-manager";

export interface HybridEnvironmentBuilderConfig {
	worktree: WorktreeConfig;
}

export type EnvironmentType = "worktree" | "host";

export interface EnvironmentInfo {
	issueNumber: number;
	type: EnvironmentType;
	worktree?: WorktreeInfo;
	workingDirectory: string;
}

export class HybridEnvironmentBuilder {
	private readonly config: HybridEnvironmentBuilderConfig;
	private readonly worktreeManager: WorktreeManager;
	private readonly projectRoot: string;
	private readonly environmentStore: Map<number, EnvironmentInfo> = new Map();

	constructor(
		config: HybridEnvironmentBuilderConfig,
		worktreeManager: WorktreeManager,
		projectRoot: string,
	) {
		this.config = config;
		this.worktreeManager = worktreeManager;
		this.projectRoot = projectRoot;
	}

	async buildEnvironment(issueNumber: number): Promise<EnvironmentInfo> {
		const worktreeEnabled = this.config.worktree.enabled;

		let worktree: WorktreeInfo | undefined;
		let type: EnvironmentType;
		let workingDirectory: string;

		if (worktreeEnabled) {
			const worktreeResult = await this.worktreeManager.createWorktree(issueNumber, "host");
			if (worktreeResult) {
				worktree = worktreeResult;
				workingDirectory = path.join(this.projectRoot, worktreeResult.path);
				type = "worktree";
			} else {
				workingDirectory = this.projectRoot;
				type = "host";
			}
		} else {
			workingDirectory = this.projectRoot;
			type = "host";
		}

		const info: EnvironmentInfo = {
			issueNumber,
			type,
			worktree,
			workingDirectory,
		};

		this.environmentStore.set(issueNumber, info);
		return info;
	}

	async destroyEnvironment(issueNumber: number): Promise<void> {
		const info = this.environmentStore.get(issueNumber);

		if (info?.worktree) {
			await this.worktreeManager.removeWorktree(issueNumber);
		}

		this.environmentStore.delete(issueNumber);
	}
}
