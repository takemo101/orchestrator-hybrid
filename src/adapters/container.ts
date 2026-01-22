import { execa } from "execa";
import { logger } from "../core/logger.js";
import type { BackendResult } from "../core/types.js";
import { BaseBackend } from "./base.js";

export interface ContainerConfig {
	image?: string;
	workdir?: string;
	envId?: string;
}

export class ContainerBackend extends BaseBackend {
	readonly name = "container";
	private envId: string | null = null;
	private readonly workdir: string;
	private readonly image: string;

	constructor(config: ContainerConfig = {}) {
		super();
		this.workdir = config.workdir ?? process.cwd();
		this.image = config.image ?? "node:20";
		this.envId = config.envId ?? null;
	}

	async execute(prompt: string): Promise<BackendResult> {
		try {
			if (!this.envId) {
				await this.createEnvironment();
			}

			const result = await this.runInContainer(prompt);
			return result;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				output: message,
				exitCode: 1,
			};
		}
	}

	private async createEnvironment(): Promise<void> {
		logger.info("Creating container-use environment...");

		const { stdout } = await execa("cu", [
			"environment",
			"create",
			"--source",
			this.workdir,
			"--title",
			"orchestrator-hybrid",
			"--json",
		]);

		const result = JSON.parse(stdout);
		this.envId = result.environment_id;

		logger.info(`Environment created: ${this.envId}`);
	}

	private async runInContainer(prompt: string): Promise<BackendResult> {
		if (!this.envId) {
			throw new Error("No environment ID available");
		}

		const { stdout, exitCode } = await execa(
			"cu",
			[
				"environment",
				"run",
				"--id",
				this.envId,
				"--source",
				this.workdir,
				"--command",
				`claude -p "${prompt.replace(/"/g, '\\"')}" --allowedTools Edit,Write,Bash,Read,Glob,Grep`,
			],
			{ reject: false },
		);

		return {
			output: stdout,
			exitCode: exitCode ?? 0,
		};
	}

	async cleanup(): Promise<void> {
		if (!this.envId) {
			return;
		}

		logger.info(`Cleaning up environment: ${this.envId}`);

		try {
			await execa("cu", [
				"environment",
				"delete",
				"--id",
				this.envId,
				"--source",
				this.workdir,
			]);
			logger.info("Environment deleted");
		} catch {
			logger.warn("Failed to delete environment");
		}

		this.envId = null;
	}

	getEnvironmentId(): string | null {
		return this.envId;
	}
}
