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
import { ContainerAdapter } from "./container-adapter.js";
import { DockerAdapter } from "./docker-adapter.js";
import { HostAdapter } from "./host-adapter.js";
import type { SandboxAdapter } from "./sandbox-adapter.js";

/**
 * サンドボックス設定型
 * Issue #13 完了後は Config に統合予定
 */
export interface SandboxConfig {
	type?: "docker" | "container-use" | "host";
	fallback?: "docker" | "container-use" | "host";
	docker?: {
		image?: string;
		network?: "none" | "bridge" | "host";
		timeout?: number; // 秒単位
	};
	containerUse?: {
		image?: string;
		envId?: string;
	};
	host?: {
		timeout?: number; // 秒単位
		warnOnStart?: boolean;
	};
}

/**
 * sandbox設定を含むConfig型（暫定）
 */
interface ConfigWithSandbox extends Config {
	sandbox?: SandboxConfig;
}

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
		const configWithSandbox = config as ConfigWithSandbox;
		const sandboxType = configWithSandbox.sandbox?.type ?? "container-use";
		const fallbackType = configWithSandbox.sandbox?.fallback;

		// プライマリ環境を試行
		const primaryAdapter = SandboxFactory.createAdapter(sandboxType, configWithSandbox, executor);
		if (await primaryAdapter.isAvailable()) {
			logger.info(`サンドボックス環境: ${sandboxType}`);
			return primaryAdapter;
		}

		// フォールバック環境を試行
		if (fallbackType) {
			logger.warn(`${sandboxType}が利用できません。${fallbackType}にフォールバックします。`);

			const fallbackAdapter = SandboxFactory.createAdapter(
				fallbackType,
				configWithSandbox,
				executor,
			);
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
		config: ConfigWithSandbox,
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

			case "container-use":
				return new ContainerAdapter(
					{
						image: config.sandbox?.containerUse?.image,
						envId: config.sandbox?.containerUse?.envId,
					},
					resolvedExecutor,
				);

			case "host":
				return new HostAdapter(
					{
						timeout: config.sandbox?.host?.timeout
							? config.sandbox.host.timeout * 1000 // 秒→ミリ秒
							: undefined,
						warnOnStart: config.sandbox?.host?.warnOnStart,
					},
					resolvedExecutor,
				);

			default:
				throw new Error(`Unknown sandbox type: ${type}`);
		}
	}
}
