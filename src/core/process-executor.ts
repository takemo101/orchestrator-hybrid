/**
 * ProcessExecutor - プロセス実行抽象化モジュール
 *
 * Bun.spawnへの直接依存を排除し、将来のランタイム切り替えを容易にする。
 * テスト時のモック化も簡単になる。
 *
 * @module
 */

/**
 * プロセス実行オプション
 */
export interface SpawnOptions {
	/**
	 * 作業ディレクトリ
	 * @default process.cwd()
	 */
	cwd?: string;

	/**
	 * 環境変数
	 * @default process.env
	 */
	env?: Record<string, string>;

	/**
	 * 標準入力に書き込むデータ
	 */
	stdin?: string;

	/**
	 * タイムアウト（ミリ秒）
	 * @default undefined（無制限）
	 */
	timeout?: number;

	/**
	 * 標準出力の処理方法
	 * - "pipe": パイプで取得（デフォルト）
	 * - "inherit": 親プロセスの標準出力に出力
	 */
	stdout?: "pipe" | "inherit";

	/**
	 * 標準エラー出力の処理方法
	 * - "pipe": パイプで取得（デフォルト）
	 * - "inherit": 親プロセスの標準エラー出力に出力
	 */
	stderr?: "pipe" | "inherit";
}

/**
 * プロセス実行結果
 */
export interface ProcessResult {
	/**
	 * 標準出力
	 * stdout="inherit"の場合は空文字列
	 */
	stdout: string;

	/**
	 * 標準エラー出力
	 * stderr="inherit"の場合は空文字列
	 */
	stderr: string;

	/**
	 * 終了コード
	 * 0: 正常終了
	 * 非0: エラー終了
	 */
	exitCode: number;
}

/**
 * プロセス実行を抽象化するインターフェース
 *
 * 実装クラス:
 * - BunProcessExecutor: Bun.spawnを使用
 * - (将来) NodeProcessExecutor: child_processを使用
 *
 * @example
 * ```typescript
 * const executor = new BunProcessExecutor();
 * const result = await executor.spawn("echo", ["hello"], {
 *   timeout: 5000,
 * });
 * console.log(result.stdout); // "hello\n"
 * ```
 */
export interface ProcessExecutor {
	/**
	 * コマンドを実行する
	 *
	 * @param command 実行するコマンド（例: "docker", "gh"）
	 * @param args コマンド引数の配列
	 * @param options 実行オプション
	 * @returns 実行結果のPromise
	 * @throws ProcessExecutionError タイムアウトまたは実行失敗時
	 */
	spawn(command: string, args: string[], options?: SpawnOptions): Promise<ProcessResult>;
}
