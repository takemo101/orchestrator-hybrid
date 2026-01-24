/**
 * ContainerAdapter - container-use環境でコードを実行するアダプター
 *
 * 既存のContainerBackendをSandboxAdapterインターフェースに適合させたリファクタリング版
 *
 * @module
 */

import type { SandboxAdapter, ExecuteOptions, ExecuteResult } from "./sandbox-adapter.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { logger } from "../core/logger.js";

/**
 * container-use設定
 */
export interface ContainerAdapterConfig {
	/** ベースイメージ */
	image?: string;

	/** 作業ディレクトリ */
	workdir?: string;

	/** 既存の環境ID（再利用する場合） */
	envId?: string;
}

/**
 * container-use環境でコードを実行するアダプター
 *
 * @example
 * ```typescript
 * const adapter = new ContainerAdapter({
 *   image: "node:20",
 *   workdir: "/path/to/project",
 * });
 *
 * if (await adapter.isAvailable()) {
 *   const result = await adapter.execute("npm test");
 *   console.log(result.stdout);
 * }
 *
 * await adapter.cleanup();
 * ```
 */
export class ContainerAdapter implements SandboxAdapter {
	readonly name = "container-use";
	private envId: string | null = null;
	private readonly config: ContainerAdapterConfig;
	private readonly executor: ProcessExecutor;

	/**
	 * ContainerAdapterを作成
	 *
	 * @param config container-use設定
	 * @param executor ProcessExecutor（テスト時のモック用）
	 */
	constructor(config: ContainerAdapterConfig = {}, executor: ProcessExecutor = new BunProcessExecutor()) {
		this.config = config;
		this.executor = executor;
		this.envId = config.envId ?? null;
	}

	/**
	 * container-use環境が利用可能かチェック
	 *
	 * @returns cuコマンドが利用可能な場合はtrue
	 */
	async isAvailable(): Promise<boolean> {
		try {
			const result = await this.executor.spawn("cu", ["--version"]);
			return result.exitCode === 0;
		} catch {
			return false;
		}
	}

	/**
	 * container-use環境でコマンドを実行
	 *
	 * @param command 実行するコマンド
	 * @param options 実行オプション
	 * @returns 実行結果
	 * @throws Error 環境作成失敗時
	 */
	async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
		// 環境が未作成なら作成
		if (!this.envId) {
			await this.createEnvironment();
		}

		// コンテナ内で実行
		const result = await this.runInContainer(command, options);
		return result;
	}

	/**
	 * 環境をクリーンアップ
	 *
	 * コンテナ環境を削除します。
	 * 複数回呼び出しても安全です（冪等性）。
	 */
	async cleanup(): Promise<void> {
		if (!this.envId) {
			return;
		}

		logger.info(`環境をクリーンアップ中: ${this.envId}`);

		try {
			const workdir = this.config.workdir ?? process.cwd();

			await this.executor.spawn("cu", ["environment", "delete", "--id", this.envId, "--source", workdir]);

			logger.success("環境を削除しました");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logger.warn(`環境削除に失敗: ${message}`);
		}

		this.envId = null;
	}

	/**
	 * 環境IDを取得
	 *
	 * @returns 環境ID（未作成の場合はnull）
	 */
	getEnvironmentId(): string | null {
		return this.envId;
	}

	/**
	 * container-use環境を作成
	 * @private
	 */
	private async createEnvironment(): Promise<void> {
		logger.info("container-use環境を作成中...");

		const workdir = this.config.workdir ?? process.cwd();

		const result = await this.executor.spawn("cu", [
			"environment",
			"create",
			"--source",
			workdir,
			"--title",
			"orchestrator-hybrid",
			"--json",
		]);

		if (result.exitCode !== 0) {
			throw new Error(`環境作成に失敗: ${result.stderr}`);
		}

		const data = JSON.parse(result.stdout);
		this.envId = data.environment_id;

		logger.success(`環境を作成しました: ${this.envId}`);
	}

	/**
	 * コンテナ内でコマンドを実行
	 * @private
	 */
	private async runInContainer(command: string, options: ExecuteOptions): Promise<ExecuteResult> {
		if (!this.envId) {
			throw new Error("環境IDが設定されていません");
		}

		const workdir = options.cwd ?? this.config.workdir ?? process.cwd();

		const result = await this.executor.spawn(
			"cu",
			["environment", "run", "--id", this.envId, "--source", workdir, "--command", command],
			{
				timeout: options.timeout,
			},
		);

		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
		};
	}
}

// 後方互換性のためのエクスポート
export { ContainerAdapter as ContainerBackend };
