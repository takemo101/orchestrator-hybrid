/**
 * DockerAdapter - Dockerコンテナでコードを実行するアダプター
 *
 * @module
 */

import type { SandboxAdapter, ExecuteOptions, ExecuteResult } from "./sandbox-adapter.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { ImagePullError } from "../core/errors.js";
import { logger } from "../core/logger.js";

/**
 * Docker設定
 */
export interface DockerAdapterConfig {
	/** ベースイメージ（必須） */
	image: string;

	/** 作業ディレクトリ（デフォルト: process.cwd()） */
	workdir?: string;

	/**
	 * ネットワーク設定
	 * - "none": ネットワーク無効（最も安全）
	 * - "bridge": デフォルトブリッジネットワーク
	 * - "host": ホストネットワーク（非推奨）
	 */
	network?: "none" | "bridge" | "host";

	/** タイムアウト（ミリ秒） */
	timeout?: number;
}

/**
 * Dockerコンテナでコードを実行するアダプター
 *
 * @example
 * ```typescript
 * const adapter = new DockerAdapter({
 *   image: "node:20-alpine",
 *   network: "none",
 *   timeout: 300000,
 * });
 *
 * if (await adapter.isAvailable()) {
 *   const result = await adapter.execute("npm test", {
 *     env: { NODE_ENV: "test" },
 *   });
 *   console.log(result.stdout);
 * }
 * ```
 */
export class DockerAdapter implements SandboxAdapter {
	readonly name = "docker";
	private readonly config: DockerAdapterConfig;
	private readonly executor: ProcessExecutor;

	/**
	 * DockerAdapterを作成
	 *
	 * @param config Docker設定
	 * @param executor ProcessExecutor（テスト時のモック用）
	 */
	constructor(config: DockerAdapterConfig, executor: ProcessExecutor = new BunProcessExecutor()) {
		this.config = config;
		this.executor = executor;
	}

	/**
	 * Docker環境が利用可能かチェック
	 *
	 * @returns Dockerが利用可能な場合はtrue
	 */
	async isAvailable(): Promise<boolean> {
		try {
			const result = await this.executor.spawn("docker", ["--version"]);
			return result.exitCode === 0;
		} catch {
			return false;
		}
	}

	/**
	 * Dockerコンテナ内でコマンドを実行
	 *
	 * @param command 実行するコマンド
	 * @param options 実行オプション
	 * @returns 実行結果
	 * @throws ImagePullError イメージpull失敗時
	 */
	async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
		// イメージの存在確認（なければpull）
		await this.ensureImage();

		// docker runコマンドの構築
		const args = this.buildDockerRunArgs(command, options);

		// 実行
		const result = await this.executor.spawn("docker", args, {
			timeout: options.timeout ?? this.config.timeout,
		});

		return {
			stdout: result.stdout,
			stderr: result.stderr,
			exitCode: result.exitCode,
		};
	}

	/**
	 * クリーンアップ
	 *
	 * Dockerは--rmで自動削除されるため、特に処理なし
	 */
	async cleanup(): Promise<void> {
		// Dockerは--rmで自動削除されるため、特に処理なし
	}

	/**
	 * Dockerイメージの存在を確認し、なければpull
	 * @private
	 */
	private async ensureImage(): Promise<void> {
		// イメージの存在確認
		const result = await this.executor.spawn("docker", ["image", "inspect", this.config.image]);

		if (result.exitCode !== 0) {
			// イメージが存在しない場合はpull
			logger.info(`Dockerイメージをpull中: ${this.config.image}`);

			const pullResult = await this.executor.spawn("docker", ["pull", this.config.image]);

			if (pullResult.exitCode !== 0) {
				throw new ImagePullError(this.config.image, pullResult.stderr);
			}

			logger.success(`Dockerイメージをpullしました: ${this.config.image}`);
		}
	}

	/**
	 * docker runコマンドの引数を構築
	 * @private
	 */
	private buildDockerRunArgs(command: string, options: ExecuteOptions): string[] {
		const args = [
			"run",
			"--rm", // 実行後に自動削除
			"-i", // インタラクティブモード
		];

		// ネットワーク設定
		if (this.config.network) {
			args.push("--network", this.config.network);
		}

		// 作業ディレクトリのマウント
		const workdir = options.cwd ?? this.config.workdir ?? process.cwd();
		args.push("-v", `${workdir}:/workspace`);
		args.push("-w", "/workspace");

		// 環境変数
		if (options.env) {
			for (const [key, value] of Object.entries(options.env)) {
				args.push("-e", `${key}=${value}`);
			}
		}

		// イメージとコマンド
		args.push(this.config.image);
		args.push("sh", "-c", command);

		return args;
	}
}
