import { OrchestratorError } from "./errors.js";
import { EventBus } from "./event.js";
import { extractEventFromOutput, HatSystem } from "./hat.js";
import type { HatDefinition } from "./types.js";

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
	/** 初期イベント（Hat切り替えの起点） */
	initialEvent?: string;
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
 * Hat情報を含むイテレーションコンテキスト
 */
export interface IterationContext {
	/** イテレーション番号（1始まり） */
	iteration: number;
	/** 現在アクティブなHat（Hatシステム有効時） */
	activeHat?: HatDefinition;
	/** 現在のイベントトピック（Hatシステム有効時） */
	currentEvent?: string;
}

/**
 * ループ内で各イテレーションを実行する関数の型。
 *
 * LoopEngineはAIバックエンドの具体的な実行方法を知らない。
 * 呼び出し元がこの関数を通じてバックエンド実行を注入する。
 *
 * @param context - イテレーションコンテキスト（Hat情報を含む）
 * @returns イテレーションの出力文字列
 */
export type IterationRunner = (context: IterationContext) => Promise<string>;

/**
 * ループ実行エンジン
 *
 * AIバックエンドを反復実行し、LOOP_COMPLETEキーワードの検出
 * または最大反復回数到達まで繰り返す。
 *
 * v3.0.0: HatSystemと連携し、イベントに基づいてHatを切り替える。
 * バックエンドの具体的な実行はIterationRunner関数で抽象化し、
 * ISessionManagerとの連携は呼び出し元が担当する。
 */
export class LoopEngine {
	private readonly eventBus: EventBus;
	private readonly hatSystem?: HatSystem;

	constructor(eventBus?: EventBus, hatSystem?: HatSystem) {
		this.eventBus = eventBus ?? new EventBus();
		this.hatSystem = hatSystem;
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
		let currentEvent = options.initialEvent ?? "task.start";

		this.eventBus.emit("loop.start", "LoopEngine", { maxIterations });

		// 初期イベントを発行（Hatシステム連携用）
		if (this.hatSystem && currentEvent) {
			this.eventBus.emit(currentEvent, "LoopEngine", { type: "initial" });
		}

		for (let i = 1; i <= maxIterations; i++) {
			// 中断チェック
			if (signal?.aborted) {
				this.eventBus.emit("loop.aborted", "LoopEngine", { iteration: i });
				return { success: false, iterations: i - 1, lastOutput };
			}

			// 現在のイベントに一致するHatを検索
			const activeHat = this.hatSystem?.findHatByTrigger(currentEvent) ?? undefined;

			if (activeHat) {
				this.eventBus.emit("hat.activated", "LoopEngine", {
					iteration: i,
					hatName: activeHat.name,
					trigger: currentEvent,
				});
			}

			this.eventBus.emit("iteration.start", "LoopEngine", {
				iteration: i,
				activeHat: activeHat?.name,
				currentEvent,
			});

			let output: string;
			try {
				output = await runner({
					iteration: i,
					activeHat,
					currentEvent,
				});
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

			// 出力からイベントを抽出
			const extractedEvent = extractEventFromOutput(output);

			this.eventBus.emit("iteration.end", "LoopEngine", {
				iteration: i,
				outputLength: output.length,
				extractedEvent,
			});

			// 完了キーワード検出（大文字小文字区別なし）
			if (output.toLowerCase().includes(completionKeyword.toLowerCase())) {
				this.eventBus.emit("loop.complete", "LoopEngine", {
					iteration: i,
					keyword: completionKeyword,
				});
				return { success: true, iterations: i, lastOutput: output };
			}

			// 抽出されたイベントがあれば次のイベントとして使用
			if (extractedEvent && extractedEvent !== "LOOP_COMPLETE") {
				this.eventBus.emit(extractedEvent, "LoopEngine", {
					iteration: i,
					source: "ai_output",
				});
				currentEvent = extractedEvent;
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

	/**
	 * Hatシステムを取得する
	 */
	getHatSystem(): HatSystem | undefined {
		return this.hatSystem;
	}
}
