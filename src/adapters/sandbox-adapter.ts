/**
 * SandboxAdapter インターフェース定義
 *
 * サンドボックス環境（Docker、container-use、ホスト）を
 * 統一的に扱うためのインターフェースを定義します。
 *
 * @example
 * ```typescript
 * const adapter: SandboxAdapter = await SandboxFactory.create(config);
 *
 * if (await adapter.isAvailable()) {
 *   const result = await adapter.execute("npm test", {
 *     cwd: "/workspace",
 *     timeout: 60000,
 *   });
 *   console.log(result.stdout);
 * }
 *
 * await adapter.cleanup();
 * ```
 */

/**
 * コマンド実行オプション
 */
export interface ExecuteOptions {
	/**
	 * 作業ディレクトリ
	 * @default アダプター固有のデフォルト
	 */
	cwd?: string;

	/**
	 * 環境変数
	 * @example { NODE_ENV: "production" }
	 */
	env?: Record<string, string>;

	/**
	 * タイムアウト（ミリ秒）
	 * @default アダプター固有のデフォルト
	 */
	timeout?: number;
}

/**
 * コマンド実行結果
 */
export interface ExecuteResult {
	/**
	 * 標準出力
	 */
	stdout: string;

	/**
	 * 標準エラー出力
	 */
	stderr: string;

	/**
	 * 終了コード
	 * - 0: 正常終了
	 * - 非0: エラー終了
	 */
	exitCode: number;
}

/**
 * サンドボックス環境の抽象インターフェース
 *
 * 実装クラス:
 * - DockerAdapter: Dockerコンテナで実行
 * - ContainerAdapter: container-use環境で実行
 * - HostAdapter: ホスト環境で直接実行（非推奨）
 */
export interface SandboxAdapter {
	/**
	 * アダプター名
	 * @example "docker", "container-use", "host"
	 */
	readonly name: string;

	/**
	 * この環境が利用可能かどうかをチェック
	 *
	 * @returns 利用可能な場合はtrue
	 *
	 * @example
	 * ```typescript
	 * if (await adapter.isAvailable()) {
	 *   // 環境が利用可能
	 * } else {
	 *   // フォールバック処理
	 * }
	 * ```
	 */
	isAvailable(): Promise<boolean>;

	/**
	 * コマンドを実行
	 *
	 * @param command 実行するコマンド文字列
	 * @param options 実行オプション
	 * @returns 実行結果
	 * @throws SandboxError 実行エラー時
	 *
	 * @example
	 * ```typescript
	 * const result = await adapter.execute("npm test", {
	 *   cwd: "/workspace",
	 *   env: { NODE_ENV: "test" },
	 *   timeout: 120000,
	 * });
	 *
	 * if (result.exitCode === 0) {
	 *   console.log("Tests passed:", result.stdout);
	 * } else {
	 *   console.error("Tests failed:", result.stderr);
	 * }
	 * ```
	 */
	execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

	/**
	 * 環境をクリーンアップ
	 *
	 * コンテナの削除、一時ファイルの削除などを行います。
	 * 複数回呼び出しても安全です（冪等性）。
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   await adapter.execute("npm test");
	 * } finally {
	 *   await adapter.cleanup();
	 * }
	 * ```
	 */
	cleanup(): Promise<void>;
}
