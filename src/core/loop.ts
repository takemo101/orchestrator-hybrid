import { OrchestratorError } from "./errors.js";
import { EventBus } from "./event.js";

/**
 * ループ実行エンジンエラー
 */
export class LoopError extends OrchestratorError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "LoopError";
	}
}

/**
 * 最大反復回数超過エラー
 */
export class MaxIterationsReachedError extends LoopError {
	readonly iterations: number;
	readonly maxIterations: number;

	constructor(iterations: number, maxIterations: number) {
		super(`Maximum iterations reached: ${iterations}/${maxIterations}`);
		this.name = "MaxIterationsReachedError";
		this.iterations = iterations;
		this.maxIterations = maxIterations;
	}
}

/**
 * ループ実行オプション
 */
export interface LoopOptions {
	/** 最大反復回数（デフォルト: 100） */
	maxIterations?: number;
	/** 完了判定キーワード（デフォルト: "LOOP_COMPLETE"） */
	completionKeyword?: string;
	/** 中断シグナル */
	signal?: AbortSignal;
}

/**
 * ループ実行結果
 */
export interface LoopResult {
	/** 完了キーワードを検出したか */
	success: boolean;
	/** 実行されたイテレーション回数 */
	iterations: number;
	/** 最終イテレーションの出力 */
	lastOutput: string;
}

/**
 * ループ内で各イテレーションを実行する関数の型。
 *
 * LoopEngineはAIバックエンドの具体的な実行方法を知らない。
 * 呼び出し元がこの関数を通じてバックエンド実行を注入する。
 *
 * @param iteration - 現在のイテレーション番号（1始まり）
 * @returns イテレーションの出力文字列
 */
export type IterationRunner = (iteration: number) => Promise<string>;

/**
 * ループ実行エンジン
 *
 * AIバックエンドを反復実行し、LOOP_COMPLETEキーワードの検出
 * または最大反復回数到達まで繰り返す。
 *
 * バックエンドの具体的な実行はIterationRunner関数で抽象化し、
 * ISessionManagerとの連携は呼び出し元が担当する。
 */
export class LoopEngine {
	private readonly eventBus: EventBus;

	constructor(eventBus?: EventBus) {
		this.eventBus = eventBus ?? new EventBus();
	}

	/**
	 * ループを実行する
	 *
	 * @param runner - 各イテレーションを実行する関数
	 * @param options - ループオプション
	 * @returns ループ実行結果
	 * @throws {LoopError} イテレーション実行エラー
	 * @throws {MaxIterationsReachedError} 最大反復回数超過
	 */
	async run(runner: IterationRunner, options: LoopOptions = {}): Promise<LoopResult> {
		const maxIterations = options.maxIterations ?? 100;
		const completionKeyword = options.completionKeyword ?? "LOOP_COMPLETE";
		const signal = options.signal;

		let lastOutput = "";

		this.eventBus.emit("loop.start", "LoopEngine", { maxIterations });

		for (let i = 1; i <= maxIterations; i++) {
			// 中断チェック
			if (signal?.aborted) {
				this.eventBus.emit("loop.aborted", "LoopEngine", { iteration: i });
				return { success: false, iterations: i - 1, lastOutput };
			}

			this.eventBus.emit("iteration.start", "LoopEngine", { iteration: i });

			let output: string;
			try {
				output = await runner(i);
			} catch (error) {
				this.eventBus.emit("iteration.error", "LoopEngine", {
					iteration: i,
					error: String(error),
				});
				throw new LoopError(
					`Iteration ${i} failed: ${error instanceof Error ? error.message : String(error)}`,
					{ cause: error },
				);
			}

			lastOutput = output;

			this.eventBus.emit("iteration.end", "LoopEngine", {
				iteration: i,
				outputLength: output.length,
			});

			// 完了キーワード検出（大文字小文字区別なし）
			if (output.toLowerCase().includes(completionKeyword.toLowerCase())) {
				this.eventBus.emit("loop.complete", "LoopEngine", {
					iteration: i,
					keyword: completionKeyword,
				});
				return { success: true, iterations: i, lastOutput: output };
			}
		}

		// 最大反復回数到達
		this.eventBus.emit("loop.maxIterations", "LoopEngine", { maxIterations });
		throw new MaxIterationsReachedError(maxIterations, maxIterations);
	}

	/**
	 * イベントバスを取得する
	 */
	getEventBus(): EventBus {
		return this.eventBus;
	}
}
