import * as path from "node:path";
import { HybridEnvironmentError } from "../core/errors";
import type { SandboxConfig, WorktreeConfig, WorktreeInfo } from "../core/types";
import type { ProcessExecutor } from "./worktree-manager";
import { BunProcessExecutor, type WorktreeManager } from "./worktree-manager";

export interface HybridEnvironmentBuilderConfig {
	worktree: WorktreeConfig;
	sandbox: SandboxConfig;
	container?: {
		enabled?: boolean;
		image?: string;
		env_id?: string;
	};
}

export type EnvironmentType = "hybrid" | "worktree-only" | "container-only" | "host";

export interface EnvironmentInfo {
	issueNumber: number;
	type: EnvironmentType;
	worktree?: WorktreeInfo;
	environmentType: "container-use" | "docker" | "host";
	environmentId?: string;
	workingDirectory: string;
}

export class HybridEnvironmentBuilder {
	private readonly config: HybridEnvironmentBuilderConfig;
	private readonly worktreeManager: WorktreeManager;
	private readonly projectRoot: string;
	private readonly executor: ProcessExecutor;
	private readonly environmentStore: Map<number, EnvironmentInfo> = new Map();

	constructor(
		config: HybridEnvironmentBuilderConfig,
		worktreeManager: WorktreeManager,
		projectRoot: string,
		executor?: ProcessExecutor,
	) {
		this.config = config;
		this.worktreeManager = worktreeManager;
		this.projectRoot = projectRoot;
		this.executor = executor ?? new BunProcessExecutor();
	}

	async buildEnvironment(issueNumber: number): Promise<EnvironmentInfo> {
		const worktreeEnabled = this.config.worktree.enabled;
		const sandboxType = this.config.sandbox.type;

		let worktree: WorktreeInfo | undefined;
		let environmentId: string | undefined;
		let environmentType: "container-use" | "docker" | "host";
		let type: EnvironmentType;
		let workingDirectory: string;

		if (worktreeEnabled) {
			const worktreeResult = await this.worktreeManager.createWorktree(
				issueNumber,
				sandboxType === "container-use"
					? "container-use"
					: sandboxType === "docker"
						? "docker"
						: "host",
			);
			if (worktreeResult) {
				worktree = worktreeResult;
				workingDirectory = path.join(this.projectRoot, worktreeResult.path);
			} else {
				workingDirectory = this.projectRoot;
			}

			if (sandboxType === "container-use") {
				environmentId = await this.createContainerUseEnvironment(workingDirectory);
				await this.worktreeManager.updateWorktree(issueNumber, { environmentId });
				environmentType = "container-use";
				type = "hybrid";
			} else if (sandboxType === "docker") {
				environmentId = await this.createDockerEnvironment(workingDirectory);
				await this.worktreeManager.updateWorktree(issueNumber, { environmentId });
				environmentType = "docker";
				type = "hybrid";
			} else {
				environmentType = "host";
				type = "worktree-only";
			}
		} else {
			workingDirectory = this.projectRoot;

			if (sandboxType === "container-use") {
				environmentId = await this.createContainerUseEnvironment(workingDirectory);
				environmentType = "container-use";
				type = "container-only";
			} else if (sandboxType === "docker") {
				environmentId = await this.createDockerEnvironment(workingDirectory);
				environmentType = "docker";
				type = "container-only";
			} else {
				environmentType = "host";
				type = "host";
			}
		}

		const info: EnvironmentInfo = {
			issueNumber,
			type,
			worktree,
			environmentType,
			environmentId,
			workingDirectory,
		};

		this.environmentStore.set(issueNumber, info);
		return info;
	}

	async destroyEnvironment(issueNumber: number): Promise<void> {
		const info = this.environmentStore.get(issueNumber);

		if (info?.environmentId) {
			if (info.environmentType === "container-use") {
				await this.deleteContainerUseEnvironment(info.environmentId);
			} else if (info.environmentType === "docker") {
				await this.deleteDockerContainer(info.environmentId);
			}
		}

		if (info?.worktree) {
			await this.worktreeManager.removeWorktree(issueNumber);
		}

		this.environmentStore.delete(issueNumber);
	}

	private async createContainerUseEnvironment(sourcePath: string): Promise<string> {
		const result = await this.executor.execute("cu", ["env", "create", "--source", sourcePath]);

		if (result.exitCode !== 0) {
			throw new HybridEnvironmentError(`container-use環境作成失敗: ${result.stderr}`, {
				sourcePath,
				stderr: result.stderr,
				exitCode: result.exitCode,
			});
		}

		return result.stdout.trim();
	}

	private async createDockerEnvironment(workspacePath: string): Promise<string> {
		const dockerConfig = this.config.sandbox.docker;
		const image = dockerConfig?.image ?? "node:20-alpine";
		const network = dockerConfig?.network ?? "bridge";

		const result = await this.executor.execute("docker", [
			"run",
			"-d",
			"--network",
			network,
			"-v",
			`${workspacePath}:/workspace`,
			"-w",
			"/workspace",
			image,
			"tail",
			"-f",
			"/dev/null",
		]);

		if (result.exitCode !== 0) {
			throw new HybridEnvironmentError(`Docker環境作成失敗: ${result.stderr}`, {
				workspacePath,
				image,
				stderr: result.stderr,
				exitCode: result.exitCode,
			});
		}

		return result.stdout.trim();
	}

	private async deleteContainerUseEnvironment(environmentId: string): Promise<void> {
		await this.executor.execute("cu", ["env", "delete", environmentId]);
	}

	private async deleteDockerContainer(containerId: string): Promise<void> {
		await this.executor.execute("docker", ["rm", "-f", containerId]);
	}
}
