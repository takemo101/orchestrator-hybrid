import { z } from "zod";

export const HatSchema = z.object({
	name: z.string().optional(),
	triggers: z.array(z.string()),
	publishes: z.array(z.string()),
	instructions: z.string().optional(),
});

export const ContainerConfigSchema = z
	.object({
		enabled: z.boolean().default(false),
		image: z.string().default("node:20"),
		env_id: z.string().optional(),
	})
	.optional();

/**
 * サンドボックス設定のzodスキーマ
 */
export const SandboxConfigSchema = z.object({
	/**
	 * サンドボックスタイプ
	 * - docker: Dockerコンテナ
	 * - container-use: container-use環境
	 * - host: ホスト環境（隔離なし）
	 */
	type: z.enum(["docker", "container-use", "host"]).default("container-use"),

	/**
	 * フォールバック先のサンドボックスタイプ
	 * プライマリが利用できない場合に使用
	 */
	fallback: z.enum(["docker", "container-use", "host"]).optional(),

	/**
	 * Docker設定
	 */
	docker: z
		.object({
			/**
			 * Dockerイメージ名
			 * @example "node:20-alpine"
			 */
			image: z.string().default("node:20-alpine"),

			/**
			 * ネットワークモード
			 * - none: ネットワーク無効（最も安全）
			 * - bridge: ブリッジネットワーク
			 * - host: ホストネットワーク
			 */
			network: z.enum(["none", "bridge", "host"]).optional(),

			/**
			 * タイムアウト（秒）
			 */
			timeout: z.number().default(300),
		})
		.optional(),

	/**
	 * container-use設定
	 */
	containerUse: z
		.object({
			image: z.string().optional(),
			envId: z.string().optional(),
		})
		.optional(),

	/**
	 * ホスト環境設定
	 */
	host: z
		.object({
			/**
			 * タイムアウト（秒）
			 */
			timeout: z.number().default(300),

			/**
			 * 初回実行時に警告を表示するか
			 */
			warnOnStart: z.boolean().default(true),
		})
		.optional(),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

/**
 * 改善Issue自動作成設定のzodスキーマ
 */
export const AutoIssueConfigSchema = z.object({
	/**
	 * Issue自動作成を有効にするか
	 */
	enabled: z.boolean().default(false),

	/**
	 * Issue作成する最低優先度
	 * - high: 高優先度のみ
	 * - medium: 中優先度以上
	 * - low: すべて
	 */
	minPriority: z.enum(["high", "medium", "low"]).default("medium"),

	/**
	 * 自動作成されたIssueに付与するラベル
	 */
	labels: z.array(z.string()).default(["auto-generated", "improvement"]),

	/**
	 * リポジトリ（オプション）
	 * 指定しない場合は現在のリポジトリ
	 * @example "owner/repo"
	 */
	repository: z.string().optional(),
});

export type AutoIssueConfig = z.infer<typeof AutoIssueConfigSchema>;

/**
 * PR設定のzodスキーマ
 *
 * PR自動マージ機能（F-009）の設定を定義します。
 */
export const PRConfigSchema = z.object({
	/**
	 * PR自動マージを有効にするか
	 * @default false
	 */
	autoMerge: z.boolean().default(false),

	/**
	 * マージ方式
	 * - squash: コミットをまとめてマージ（推奨）
	 * - merge: マージコミットを作成
	 * - rebase: リベースしてマージ
	 * @default "squash"
	 */
	mergeMethod: z.enum(["squash", "merge", "rebase"]).default("squash"),

	/**
	 * マージ後にブランチを削除するか
	 * @default true
	 */
	deleteBranch: z.boolean().default(true),

	/**
	 * CIタイムアウト（秒）
	 * @default 600 (10分)
	 */
	ciTimeoutSecs: z.number().min(60).max(3600).default(600),
});

export type PRConfig = z.infer<typeof PRConfigSchema>;

/**
 * 状態管理設定のzodスキーマ（v1.3.0拡張版）
 *
 * v1.3.0でlabel_prefixを追加。
 */
export const StateConfigSchema = z.object({
	/**
	 * GitHub Issueラベルを使用するか
	 * @default true
	 */
	use_github_labels: z.boolean().default(true),

	/**
	 * Scratchpadを使用するか
	 * @default true
	 */
	use_scratchpad: z.boolean().default(true),

	/**
	 * Scratchpadのパス
	 * @default ".agent/scratchpad.md"
	 */
	scratchpad_path: z.string().default(".agent/scratchpad.md"),

	/**
	 * ステータスラベルのプレフィックス
	 * @default "orch"
	 * @example "orch" -> ラベル名 "orch:running"
	 */
	label_prefix: z.string().min(1).max(20).default("orch"),
});

/**
 * 設定ファイル全体のzodスキーマ（拡張版）
 */
export const ConfigSchema = z.object({
	version: z.string().default("1.0"),
	backend: z.object({
		type: z.enum(["claude", "opencode", "gemini", "container"]).default("claude"),
		model: z.string().optional(),
	}),
	container: ContainerConfigSchema,

	// 新規: sandbox設定
	sandbox: SandboxConfigSchema.optional(),

	loop: z.object({
		max_iterations: z.number().default(100),
		completion_promise: z.string().default("LOOP_COMPLETE"),
		idle_timeout_secs: z.number().default(1800),
	}),
	hats: z.record(z.string(), HatSchema).optional(),
	gates: z
		.object({
			after_plan: z.boolean().default(true),
			after_implementation: z.boolean().default(false),
			before_pr: z.boolean().default(true),
		})
		.optional(),
	quality: z
		.object({
			min_score: z.number().default(8),
			auto_approve_above: z.number().default(9),
		})
		.optional(),
	state: z
		.object({
			use_github_labels: z.boolean().default(true),
			use_scratchpad: z.boolean().default(true),
			scratchpad_path: z.string().default(".agent/scratchpad.md"),
		})
		.optional(),

	// 新規: 改善Issue自動作成設定
	autoIssue: AutoIssueConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Hat = z.infer<typeof HatSchema>;

export interface Issue {
	number: number;
	title: string;
	body: string;
	labels: string[];
	state: string;
}

/**
 * ループ実行コンテキスト（拡張版）
 */
export interface LoopContext {
	// 既存フィールド
	issue: Issue;
	iteration: number;
	maxIterations: number;
	scratchpadPath: string;
	promptPath: string;
	completionPromise: string;
	autoMode: boolean;
	createPR: boolean;
	draftPR: boolean;
	useContainer: boolean;
	generateReport: boolean;
	reportPath: string;
	preset?: string;

	// 新規: タスクID（並列実行対応）
	/**
	 * タスクID
	 * 並列実行時に各タスクを一意に識別するためのID
	 * @example "task-1737705600000-42"
	 */
	taskId?: string;

	// 新規: ログディレクトリ
	/**
	 * ログディレクトリパス
	 * @example ".agent/task-1737705600000-42"
	 */
	logDir?: string;
}

export interface BackendResult {
	output: string;
	exitCode: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoopEvent {
	type: string;
	timestamp: Date;
	data?: Record<string, unknown>;
}
