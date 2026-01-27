/**
 * SandboxFactory - 設定に基づいてSandboxAdapterを生成するファクトリー
 *
 * @module
 */

import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { EnvironmentUnavailableError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import type { Config } from "../core/types.js";
import { DockerAdapter } from "./docker-adapter.js";
import { HostAdapter } from "./host-adapter.js";
import type { SandboxAdapter } from "./sandbox-adapter.js";

/**
 * サンドボックスアダプターを生成するファクトリー
 *
 * @example
 * ```typescript
 * import { SandboxFactory } from "./adapters/sandbox-factory.js";
 * import { loadConfig } from "./core/config.js";
 *
 * // 設定読み込み
 * const config = await loadConfig("orch.yml");
 *
 * // アダプター生成（自動選択）
 * const adapter = await SandboxFactory.create(config);
 *
 * // コマンド実行
 * const result = await adapter.execute("npm test");
 *
 * // クリーンアップ
 * await adapter.cleanup();
 * ```
 */
export class SandboxFactory {
	/**
	 * 設定に基づいてSandboxAdapterを生成
	 *
	 * @param config 設定
	 * @param executor ProcessExecutor（テスト時のモック用）
	 * @returns SandboxAdapter
	 * @throws EnvironmentUnavailableError 利用可能な環境がない場合
	 * @throws Error 未知のサンドボックスタイプの場合
	 */
	static async create(config: Config, executor?: ProcessExecutor): Promise<SandboxAdapter> {
		const sandboxType = config.sandbox?.type ?? "docker";
		const fallbackType = config.sandbox?.fallback;

		// プライマリ環境を試行
		const primaryAdapter = SandboxFactory.createAdapter(sandboxType, config, executor);
		if (await primaryAdapter.isAvailable()) {
			logger.info(`サンドボックス環境: ${sandboxType}`);
			return primaryAdapter;
		}

		// フォールバック環境を試行
		if (fallbackType) {
			logger.warn(`${sandboxType}が利用できません。${fallbackType}にフォールバックします。`);

			const fallbackAdapter = SandboxFactory.createAdapter(fallbackType, config, executor);
			if (await fallbackAdapter.isAvailable()) {
				logger.info(`サンドボックス環境: ${fallbackType} (フォールバック)`);
				return fallbackAdapter;
			}
		}

		// どちらも利用できない場合はエラー
		const triedEnvironments = fallbackType ? `${sandboxType}, ${fallbackType}` : sandboxType;
		throw new EnvironmentUnavailableError(triedEnvironments);
	}

	/**
	 * 指定されたタイプのアダプターを生成
	 *
	 * @param type サンドボックスタイプ
	 * @param config 設定
	 * @param executor ProcessExecutor
	 * @returns SandboxAdapter
	 * @throws Error 未知のタイプの場合
	 * @private
	 */
	private static createAdapter(
		type: string,
		config: Config,
		executor?: ProcessExecutor,
	): SandboxAdapter {
		const resolvedExecutor = executor ?? new BunProcessExecutor();

		switch (type) {
			case "docker":
				return new DockerAdapter(
					{
						image: config.sandbox?.docker?.image ?? "node:20-alpine",
						network: config.sandbox?.docker?.network,
						timeout: config.sandbox?.docker?.timeout
							? config.sandbox.docker.timeout * 1000 // 秒→ミリ秒
							: undefined,
					},
					resolvedExecutor,
				);

			case "host":
				return new HostAdapter(
					{
						timeout: config.sandbox?.host?.timeout
							? config.sandbox.host.timeout * 1000 // 秒→ミリ秒
							: undefined,
						warnOnStart: config.sandbox?.host?.warn_on_start,
					},
					resolvedExecutor,
				);

			default:
				throw new Error(`Unknown sandbox type: ${type}`);
		}
	}
}
