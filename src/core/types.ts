import { z } from "zod";

// ================================
// v3.0.0 型定義
// ================================

/**
 * Worktree設定スキーマ
 */
export const WorktreeConfigSchema = z.object({
	/** Worktree機能の有効化 */
	enabled: z.boolean().default(true),
	/** 基準ディレクトリ */
	base_dir: z.string().default(".worktrees"),
	/** Worktree作成時にコピーするファイル */
	copy_files: z.array(z.string()).default([".env"]),
});

export type WorktreeConfig = z.infer<typeof WorktreeConfigSchema>;

/**
 * セッション管理設定スキーマ
 */
export const SessionConfigSchema = z.object({
	/** セッションマネージャー種別 */
	manager: z.enum(["auto", "native", "tmux", "zellij"]).default("auto"),
	/** セッション名プレフィックス */
	prefix: z.string().default("orch"),
	/** 出力キャプチャ間隔(ms) */
	capture_interval: z.number().int().positive().default(500),
});

export type SessionConfig = z.infer<typeof SessionConfigSchema>;

/**
 * オーケストレーター設定スキーマ (orch.yml)
 */
export const OrchestratorConfigSchema = z.object({
	/** AIバックエンド */
	backend: z.enum(["claude", "opencode"]).default("claude"),
	/** 承認ゲート自動化 */
	auto: z.boolean().default(false),
	/** PR自動作成 */
	create_pr: z.boolean().default(false),
	/** 最大反復回数 */
	max_iterations: z.number().int().positive().default(100),
	/** プリセット名 */
	preset: z.enum(["simple", "tdd"]).default("simple"),
	/** Worktree設定 */
	worktree: WorktreeConfigSchema.default({}),
	/** セッション管理設定 */
	session: SessionConfigSchema.default({}),
});

export type OrchestratorConfig = z.infer<typeof OrchestratorConfigSchema>;

/**
 * GitHub Issue情報スキーマ
 */
export const IssueInfoSchema = z.object({
	/** Issue番号 */
	number: z.number().int().positive(),
	/** タイトル */
	title: z.string().min(1),
	/** 本文 */
	body: z.string(),
	/** ラベル一覧 */
	labels: z.array(z.string()),
});

export type IssueInfo = z.infer<typeof IssueInfoSchema>;

/**
 * セッション状態
 */
export const SessionStatusSchema = z.enum(["running", "completed", "failed"]);

export type SessionStatus = z.infer<typeof SessionStatusSchema>;

/**
 * セッションメタデータスキーマ
 */
export const SessionMetaSchema = z.object({
	/** Issue番号 */
	id: z.string(),
	/** 実行コマンド */
	command: z.string(),
	/** コマンド引数 */
	args: z.array(z.string()),
	/** 開始日時 (ISO 8601) */
	startedAt: z.string(),
	/** セッション状態 */
	status: SessionStatusSchema,
	/** 終了コード */
	exitCode: z.number().int().nullable(),
	/** プロセスID */
	pid: z.number().int(),
});

export type SessionMeta = z.infer<typeof SessionMetaSchema>;

/**
 * Hat定義スキーマ
 */
export const HatDefinitionSchema = z.object({
	/** Hat名 */
	name: z.string().min(1),
	/** トリガーイベント一覧 */
	triggers: z.array(z.string()).min(1),
	/** 発行イベント一覧 */
	publishes: z.array(z.string()).min(1),
	/** Hat指示 */
	instructions: z.string(),
});

export type HatDefinition = z.infer<typeof HatDefinitionSchema>;
