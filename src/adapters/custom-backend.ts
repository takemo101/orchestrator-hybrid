/**
 * CustomBackend - カスタムCLI AIエージェントバックエンド
 *
 * 任意のCLI AIエージェントをバックエンドとして統合可能にします。
 *
 * @module
 */

import { BunProcessExecutor } from "../core/bun-process-executor.js";
import type { ProcessExecutor } from "../core/process-executor.js";
import type { BackendResult } from "../core/types.js";
import { BaseBackend } from "./base.js";

/**
 * カスタムバックエンド設定
 */
export interface CustomBackendConfig {
	/**
	 * 実行するCLIコマンド
	 * @example "my-agent"
	 */
	command: string;

	/**
	 * プロンプト前に挿入される引数
	 * @example ["--headless", "--auto-approve"]
	 */
	args?: string[];

	/**
	 * プロンプトの渡し方
	 * - arg: コマンドライン引数（デフォルト）
	 * - stdin: 標準入力
	 * @default "arg"
	 */
	promptMode?: "arg" | "stdin";

	/**
	 * プロンプト前のフラグ
	 * 指定しない場合はプロンプトを位置引数として渡す
	 * @example "-p", "--prompt"
	 */
	promptFlag?: string;
}

/**
 * カスタムバックエンドアダプター
 *
 * 任意のCLI AIエージェントをバックエンドとして使用可能にします。
 *
 * @example
 * ```typescript
 * // コマンドライン引数でプロンプトを渡す
 * const backend = new CustomBackend({
 *   command: "my-agent",
 *   args: ["--headless"],
 *   promptMode: "arg",
 *   promptFlag: "-p",
 * });
 * const result = await backend.execute("Write a function");
 * // 実行: my-agent --headless -p "Write a function"
 *
 * // 標準入力でプロンプトを渡す
 * const backend2 = new CustomBackend({
 *   command: "another-agent",
 *   promptMode: "stdin",
 * });
 * const result2 = await backend2.execute("Write a function");
 * // 実行: another-agent (stdin: "Write a function")
 * ```
 */
export class CustomBackend extends BaseBackend {
	readonly name: string;
	private readonly config: CustomBackendConfig;
	private readonly executor: ProcessExecutor;

	constructor(config: CustomBackendConfig, executor?: ProcessExecutor) {
		super();
		this.config = config;
		this.executor = executor ?? new BunProcessExecutor();
		this.name = `custom:${config.command}`;
	}

	/**
	 * カスタムバックエンドでプロンプトを実行
	 *
	 * @param prompt - プロンプト
	 * @returns 実行結果
	 */
	async execute(prompt: string): Promise<BackendResult> {
		try {
			const promptMode = this.config.promptMode ?? "arg";

			let result;
			if (promptMode === "stdin") {
				// 標準入力でプロンプトを渡す
				result = await this.executor.spawn(this.config.command, this.config.args ?? [], {
					stdin: prompt,
				});
			} else {
				// コマンドライン引数でプロンプトを渡す
				const args = this.buildArgs(prompt);
				result = await this.executor.spawn(this.config.command, args, {});
			}

			return {
				output: result.stdout,
				exitCode: result.exitCode,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			return {
				output: message,
				exitCode: 1,
			};
		}
	}

	/**
	 * コマンドライン引数を構築
	 *
	 * @param prompt - プロンプト
	 * @returns 引数配列
	 */
	private buildArgs(prompt: string): string[] {
		const args = [...(this.config.args ?? [])];

		if (this.config.promptFlag) {
			// フラグ付きで引数追加
			args.push(this.config.promptFlag, prompt);
		} else {
			// 位置引数として追加
			args.push(prompt);
		}

		return args;
	}
}
