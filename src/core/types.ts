import { z } from "zod";

export const HatSchema = z.object({
	name: z.string().optional(),
	triggers: z.array(z.string()),
	publishes: z.array(z.string()),
	instructions: z.string().optional(),
	/**
	 * このHat専用のモデル（v1.4.0追加）
	 * 未指定の場合は backend.model を継承
	 * @example "opus", "sonnet", "haiku", "claude-sonnet-4-5-20250929"
	 */
	model: z.string().optional(),
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
	container_use: z
		.object({
			image: z.string().optional(),
			env_id: z.string().optional(),
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
			warn_on_start: z.boolean().default(true),
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
	min_priority: z.enum(["high", "medium", "low"]).default("medium"),

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
	auto_merge: z.boolean().default(false),

	/**
	 * マージ方式
	 * - squash: コミットをまとめてマージ（推奨）
	 * - merge: マージコミットを作成
	 * - rebase: リベースしてマージ
	 * @default "squash"
	 */
	merge_method: z.enum(["squash", "merge", "rebase"]).default("squash"),

	/**
	 * マージ後にブランチを削除するか
	 * @default true
	 */
	delete_branch: z.boolean().default(true),

	/**
	 * CIタイムアウト（秒）
	 * @default 600 (10分)
	 */
	ci_timeout_secs: z.number().min(60).max(3600).default(600),
});

export type PRConfig = z.infer<typeof PRConfigSchema>;

/**
 * Issue依存関係設定のzodスキーマ（v1.3.0）
 *
 * Issue間の依存関係管理（F-011）の設定を定義します。
 */
export const DependencyConfigSchema = z.object({
	/**
	 * 依存Issueを自動的に先に実行するか
	 * trueの場合、依存Issueが未完了なら先に実行する
	 * @default false
	 */
	resolve: z.boolean().default(false),

	/**
	 * 依存関係を無視するか
	 * trueの場合、依存Issueが未完了でも実行を続行する
	 * @default false
	 */
	ignore: z.boolean().default(false),
});

export type DependencyConfig = z.infer<typeof DependencyConfigSchema>;

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
 * Tasks設定のzodスキーマ（v1.4.0）
 *
 * タスクをJSONL形式で管理する機能（F-015）の設定を定義します。
 */
export const TasksConfigSchema = z.object({
	/**
	 * Tasksを有効にするか
	 * @default true
	 */
	enabled: z.boolean().default(true),
});

export type TasksConfig = z.infer<typeof TasksConfigSchema>;

/**
 * Memories設定のzodスキーマ（v1.4.0）
 *
 * セッション間で学習内容を永続化する機能（F-014）の設定を定義します。
 */
export const MemoriesConfigSchema = z.object({
	/**
	 * Memoriesを有効にするか
	 * @default true
	 */
	enabled: z.boolean().default(true),

	/**
	 * プロンプトへの注入モード
	 * - auto: 自動注入
	 * - manual: エージェントが明示的に読み込む
	 * - none: 注入しない
	 * @default "auto"
	 */
	inject: z.enum(["auto", "manual", "none"]).default("auto"),
});

export type MemoriesConfig = z.infer<typeof MemoriesConfigSchema>;

/**
 * LoopState - ループ状態 (v1.4.0)
 */
export const LoopStateSchema = z.enum([
	"running",
	"queued",
	"merging",
	"merged",
	"needs-review",
	"crashed",
	"orphan",
	"discarded",
]);
export type LoopState = z.infer<typeof LoopStateSchema>;

/**
 * Loop - ループ情報 (v1.4.0)
 */
export const LoopSchema = z.object({
	id: z.string(),
	state: LoopStateSchema,
	worktree_path: z.string().nullable(),
	created_at: z.string(),
	updated_at: z.string(),
});
export type Loop = z.infer<typeof LoopSchema>;

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
	state: StateConfigSchema.optional(),

	// 新規: 改善Issue自動作成設定
	auto_issue: AutoIssueConfigSchema.optional(),

	// 新規: PR設定（v1.3.0）
	pr: PRConfigSchema.optional(),

	// 新規: 依存関係設定（v1.3.0）
	dependency: DependencyConfigSchema.optional(),

	// 新規: Memories設定（v1.4.0）
	memories: MemoriesConfigSchema.optional(),

	// 新規: Tasks設定（v1.4.0）
	tasks: TasksConfigSchema.optional(),
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

	// 新規: PR設定（v1.3.0）
	/**
	 * PR自動マージ設定
	 */
	prConfig?: PRConfig;

	// 新規: 依存関係オプション（v1.3.0）
	/**
	 * 依存Issueを先に実行するか
	 */
	resolveDeps?: boolean;

	/**
	 * 依存関係を無視するか
	 */
	ignoreDeps?: boolean;
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
