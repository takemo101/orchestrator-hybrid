import { OrchestratorError } from "../core/errors.js";

/**
 * 承認ゲートエラー
 */
export class ApprovalGateError extends OrchestratorError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "ApprovalGateError";
	}
}

/**
 * ゲートポイント種別
 */
export type GateType = "pre-loop" | "post-completion" | "before-pr";

/**
 * 承認結果
 */
export interface ApprovalResult {
	/** 承認されたか */
	approved: boolean;
	/** ゲートポイント種別 */
	gateType: GateType;
	/** 自動承認だったか */
	auto: boolean;
}

/**
 * ユーザー入力関数の型（DI用）
 *
 * プロンプトメッセージを表示し、ユーザーの入力を返す。
 * テスト時にstdin依存を排除するための注入ポイント。
 */
export type PromptFn = (message: string) => Promise<string>;

/**
 * 承認ゲート オプション
 */
export interface ApprovalGateOptions {
	/** 自動承認モード（--auto フラグ） */
	auto?: boolean;
	/** タイムアウト(ms)。デフォルト: 1800000 (30分) */
	timeoutMs?: number;
	/** ユーザー入力関数（DI用） */
	promptFn?: PromptFn;
}

/** デフォルトタイムアウト: 30分 */
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * ゲートポイントのラベル表示
 */
const GATE_LABELS: Record<GateType, string> = {
	"pre-loop": "Pre-Loop: 実行前確認",
	"post-completion": "Post-Completion: 完了確認",
	"before-pr": "Before PR: PR作成前確認",
};

/**
 * 承認ゲート
 *
 * 重要ポイントで人間の承認を要求するチェックポイント機能。
 * --auto フラグで全ゲートを自動承認可能。
 */
export class ApprovalGate {
	private readonly isAuto: boolean;
	private readonly timeoutMs: number;
	private readonly promptFn: PromptFn;

	constructor(options: ApprovalGateOptions = {}) {
		this.isAuto = options.auto ?? false;
		this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		this.promptFn = options.promptFn ?? defaultPromptFn;
	}

	/**
	 * 承認を要求する
	 *
	 * @param gateType - ゲートポイント種別
	 * @param context - 表示用コンテキスト情報（省略可）
	 * @returns 承認結果
	 * @throws {ApprovalGateError} TTYなし + autoなし、タイムアウト時
	 */
	async ask(gateType: GateType, context?: string): Promise<ApprovalResult> {
		// 自動承認モード
		if (this.isAuto) {
			return { approved: true, gateType, auto: true };
		}

		// ゲート情報を表示
		const label = GATE_LABELS[gateType];
		const display = context ? `\n[${label}]\n${context}\n` : `\n[${label}]\n`;

		// ユーザー入力を取得（タイムアウト付き）
		let answer: string;
		try {
			answer = await this.promptWithTimeout(`${display}Continue? [Y/n] > `, this.timeoutMs);
		} catch (error) {
			if (error instanceof ApprovalGateError) {
				throw error;
			}
			throw new ApprovalGateError("Failed to read user input", { cause: error });
		}

		const approved = isApproved(answer);
		return { approved, gateType, auto: false };
	}

	/**
	 * タイムアウト付きでユーザー入力を取得する
	 */
	private async promptWithTimeout(message: string, timeoutMs: number): Promise<string> {
		return new Promise<string>((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new ApprovalGateError(`Approval timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			this.promptFn(message)
				.then((answer) => {
					clearTimeout(timer);
					resolve(answer);
				})
				.catch((err) => {
					clearTimeout(timer);
					reject(err);
				});
		});
	}
}

/**
 * ユーザー入力が承認かどうかを判定する
 *
 * "y", "Y", 空入力(Enter) → 承認
 * それ以外 → 拒否
 */
function isApproved(answer: string): boolean {
	const normalized = answer.trim().toLowerCase();
	return normalized === "" || normalized === "y";
}

/**
 * デフォルトのpromptFn実装（readline）
 */
async function defaultPromptFn(message: string): Promise<string> {
	const { createInterface } = await import("node:readline");
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	return new Promise((resolve) => {
		rl.question(message, (answer) => {
			rl.close();
			resolve(answer);
		});
	});
}
