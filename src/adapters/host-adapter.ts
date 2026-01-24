/**
 * HostAdapter - ホスト環境で直接コードを実行するアダプター
 *
 * ⚠️ セキュリティ警告:
 * このアダプターは隔離されていない環境でコードを実行します。
 * 本番環境ではDockerまたはcontainer-useの使用を推奨します。
 *
 * @module
 */

import type { SandboxAdapter, ExecuteOptions, ExecuteResult } from "./sandbox-adapter.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { logger } from "../core/logger.js";

/**
 * ホスト環境設定
 */
export interface HostAdapterConfig {
	/** タイムアウト（ミリ秒） */
	timeout?: number;

	/**
	 * 起動時に警告を表示するか
	 * @default true
	 */
	warnOnStart?: boolean;
}

/**
 * ホスト環境で直接コードを実行するアダプター
 *
 * ⚠️ セキュリティ警告:
 * このアダプターは隔離されていない環境でコードを実行します。
 * 本番環境ではDockerまたはcontainer-useの使用を推奨します。
 *
 * @example
 * ```typescript
 * const adapter = new HostAdapter({
 *   timeout: 300000,
 *   warnOnStart: true,
 * });
 *
 * // コマンド実行（初回は警告が表示される）
 * const result = await adapter.execute("npm test");
 *
 * // 2回目以降は警告なし
 * const result2 = await adapter.execute("npm run build");
 * ```
 */
export class HostAdapter implements SandboxAdapter {
	readonly name = "host";
	private readonly config: HostAdapterConfig;
	private readonly executor: ProcessExecutor;
	private hasWarned = false;

	/**
	 * HostAdapterを作成
	 *
	 * @param config ホスト環境設定
	 * @param executor ProcessExecutor（テスト時のモック用）
	 */
	constructor(config: HostAdapterConfig = {}, executor: ProcessExecutor = new BunProcessExecutor()) {
		this.config = config;
		this.executor = executor;
	}

	/**
	 * ホスト環境は常に利用可能
	 *
	 * @returns 常にtrue
	 */
	async isAvailable(): Promise<boolean> {
		// ホスト環境は常に利用可能
		return true;
	}

	/**
	 * ホスト環境でコマンドを実行
	 *
	 * @param command 実行するコマンド
	 * @param options 実行オプション
	 * @returns 実行結果
	 */
	async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
		// 初回実行時に警告を表示
		if (!this.hasWarned && (this.config.warnOnStart ?? true)) {
			logger.warn(
				"⚠️  ホスト環境で実行中: コードは隔離されていません。\n" +
					"   本番環境ではDockerまたはcontainer-useの使用を推奨します。",
			);
			this.hasWarned = true;
		}

		// シェル経由でコマンドを実行
		const result = await this.executor.spawn("sh", ["-c", command], {
			cwd: options.cwd,
			env: options.env,
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
	 * ホスト環境では特にクリーンアップ不要
	 */
	async cleanup(): Promise<void> {
		// ホスト環境では特にクリーンアップ不要
	}
}
