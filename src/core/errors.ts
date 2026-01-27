/**
 * サンドボックス関連エラークラス階層
 *
 * エラーの継承関係:
 * Error
 * └── SandboxError
 *     ├── DockerNotFoundError
 *     ├── DockerTimeoutError
 *     ├── HostExecutionError
 *     ├── ProcessExecutionError
 *     ├── ContainerUseError
 *     ├── EnvironmentUnavailableError
 *     ├── ExecutionTimeoutError
 *     ├── ImagePullError
 *     ├── PRAutoMergeError (v1.3.0)
 *     ├── LogMonitorError (v1.3.0)
 *     ├── CircularDependencyError (v1.3.0)
 *     ├── IssueDependencyError (v1.3.0)
 *     ├── MemoryError (v1.4.0)
 *     ├── TaskError (v1.4.0)
 *     ├── SessionRecordError (v1.4.0)
 *     ├── WorktreeError (v1.4.0)
 *     ├── BackendSelectionError (v1.4.0)
 *     └── GlobPatternError (v1.4.0)
 */

/**
 * SandboxErrorのコンストラクタオプション
 */
export interface SandboxErrorOptions {
	/**
	 * エラーコード
	 * @default "SANDBOX_ERROR"
	 */
	code?: string;

	/**
	 * 追加の詳細情報
	 */
	details?: Record<string, unknown>;

	/**
	 * 原因となったエラー
	 */
	cause?: unknown;
}

/**
 * サンドボックス関連エラーの基底クラス
 *
 * @example
 * ```typescript
 * throw new SandboxError("Something went wrong", {
 *   code: "CUSTOM_ERROR",
 *   details: { context: "additional info" },
 * });
 * ```
 */
export class SandboxError extends Error {
	/**
	 * エラーコード
	 */
	readonly code: string;

	/**
	 * 追加の詳細情報
	 */
	readonly details?: Record<string, unknown>;

	constructor(message: string, options?: SandboxErrorOptions) {
		super(message, { cause: options?.cause });
		this.name = "SandboxError";
		this.code = options?.code ?? "SANDBOX_ERROR";
		this.details = options?.details;

		// スタックトレースを適切に設定
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, this.constructor);
		}
	}

	/**
	 * エラー情報をJSON形式で取得
	 */
	toJSON(): Record<string, unknown> {
		return {
			name: this.name,
			code: this.code,
			message: this.message,
			details: this.details,
			stack: this.stack,
		};
	}
}

/**
 * Dockerが見つからない場合のエラー
 *
 * @example
 * ```typescript
 * if (!dockerAvailable) {
 *   throw new DockerNotFoundError();
 * }
 * ```
 */
export class DockerNotFoundError extends SandboxError {
	constructor(message = "Docker is not installed or not in PATH") {
		super(message, {
			code: "DOCKER_NOT_FOUND",
		});
		this.name = "DockerNotFoundError";
	}
}

/**
 * Docker実行がタイムアウトした場合のエラー
 *
 * @example
 * ```typescript
 * throw new DockerTimeoutError(30000);
 * ```
 */
export class DockerTimeoutError extends SandboxError {
	/**
	 * タイムアウト時間（ミリ秒）
	 */
	readonly timeout: number;

	constructor(timeout: number) {
		super(`Docker execution timed out after ${timeout}ms`, {
			code: "DOCKER_TIMEOUT",
			details: { timeout },
		});
		this.name = "DockerTimeoutError";
		this.timeout = timeout;
	}
}

/**
 * ホスト環境でのコマンド実行が失敗した場合のエラー
 *
 * @example
 * ```typescript
 * throw new HostExecutionError("npm test failed", 1, { command: "npm test" });
 * ```
 */
export class HostExecutionError extends SandboxError {
	/**
	 * コマンドの終了コード
	 */
	readonly exitCode: number;

	constructor(message: string, exitCode: number, additionalDetails?: Record<string, unknown>) {
		super(message, {
			code: "HOST_EXECUTION_ERROR",
			details: { exitCode, ...additionalDetails },
		});
		this.name = "HostExecutionError";
		this.exitCode = exitCode;
	}
}

/**
 * プロセス実行が失敗した場合のエラー
 *
 * @example
 * ```typescript
 * throw new ProcessExecutionError("Failed to spawn process", {
 *   cause: originalError,
 *   details: { command: "echo hello" },
 * });
 * ```
 */
export class ProcessExecutionError extends SandboxError {
	constructor(
		message: string,
		options?: {
			cause?: unknown;
			details?: Record<string, unknown>;
		},
	) {
		super(message, {
			code: "PROCESS_EXECUTION_ERROR",
			...options,
		});
		this.name = "ProcessExecutionError";
	}
}

/**
 * container-use実行が失敗した場合のエラー
 *
 * @example
 * ```typescript
 * throw new ContainerUseError("Failed to create environment", {
 *   cause: originalError,
 *   details: { envId: "test-env" },
 * });
 * ```
 */
export class ContainerUseError extends SandboxError {
	constructor(
		message: string,
		options?: {
			cause?: unknown;
			details?: Record<string, unknown>;
		},
	) {
		super(message, {
			code: "CONTAINER_USE_ERROR",
			...options,
		});
		this.name = "ContainerUseError";
	}
}

/**
 * 利用可能なサンドボックス環境がない場合のエラー
 *
 * @example
 * ```typescript
 * throw new EnvironmentUnavailableError("docker, container-use");
 * ```
 */
export class EnvironmentUnavailableError extends SandboxError {
	constructor(triedEnvironments: string) {
		super(`No available sandbox environment: tried ${triedEnvironments}`, {
			code: "ENVIRONMENT_UNAVAILABLE",
			details: { triedEnvironments },
		});
		this.name = "EnvironmentUnavailableError";
	}
}

/**
 * 実行タイムアウトエラー（汎用）
 *
 * @example
 * ```typescript
 * throw new ExecutionTimeoutError(10000);
 * ```
 */
export class ExecutionTimeoutError extends SandboxError {
	/**
	 * タイムアウト時間（ミリ秒）
	 */
	readonly timeout: number;

	constructor(timeout: number) {
		super(`Execution timed out after ${timeout}ms`, {
			code: "EXECUTION_TIMEOUT",
			details: { timeout },
		});
		this.name = "ExecutionTimeoutError";
		this.timeout = timeout;
	}
}

/**
 * Dockerイメージpull失敗エラー
 *
 * @example
 * ```typescript
 * throw new ImagePullError("node:20-alpine", "pull access denied");
 * ```
 */
export class ImagePullError extends SandboxError {
	/**
	 * イメージ名
	 */
	readonly image: string;

	constructor(image: string, stderr: string) {
		super(`Failed to pull Docker image: ${image}`, {
			code: "IMAGE_PULL_ERROR",
			details: { image, stderr },
		});
		this.name = "ImagePullError";
		this.image = image;
	}
}

// v1.3.0 新規エラークラス

/**
 * PR自動マージエラー
 *
 * PR自動マージ機能（F-009）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // CI失敗時
 * throw new PRAutoMergeError(
 *   "PR #123 のCI失敗。マージを中断します。",
 *   { prNumber: 123 }
 * );
 *
 * // タイムアウト時
 * throw new PRAutoMergeError(
 *   "PR #123 のCIがタイムアウトしました（600秒）",
 *   { prNumber: 123, timeout: 600 }
 * );
 * ```
 */
export class PRAutoMergeError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "PR_AUTO_MERGE_ERROR",
			details,
		});
		this.name = "PRAutoMergeError";
	}
}

/**
 * ログ監視エラー
 *
 * リアルタイムログ監視機能（F-010）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // ログファイル不存在
 * throw new LogMonitorError(
 *   "ログファイルが見つかりません: .agent/task-123/output.log",
 *   { taskId: "task-123", logPath: ".agent/task-123/output.log" }
 * );
 * ```
 */
export class LogMonitorError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "LOG_MONITOR_ERROR",
			details,
		});
		this.name = "LogMonitorError";
	}
}

/**
 * 循環依存エラー
 *
 * Issue依存関係管理機能（F-011）で循環依存を検出した場合にスローされます。
 *
 * @example
 * ```typescript
 * throw new CircularDependencyError(
 *   "循環依存を検出: #42 -> #43 -> #44 -> #42",
 *   { cycle: [42, 43, 44, 42] }
 * );
 * ```
 */
export class CircularDependencyError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "CIRCULAR_DEPENDENCY_ERROR",
			details,
		});
		this.name = "CircularDependencyError";
	}
}

/**
 * Issue依存関係エラー
 *
 * Issue依存関係管理機能（F-011）で依存関係の取得や解決に失敗した場合にスローされます。
 *
 * @example
 * ```typescript
 * throw new IssueDependencyError(
 *   "Issue #42 の依存関係取得に失敗しました",
 *   { issueNumber: 42, cause: "API error" }
 * );
 * ```
 */
export class IssueDependencyError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "ISSUE_DEPENDENCY_ERROR",
			details,
		});
		this.name = "IssueDependencyError";
	}
}

// v1.4.0 新規エラークラス

/**
 * Memoryエラー
 *
 * Memoriesシステム（F-014）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // ファイル破損時
 * throw new MemoryError(
 *   "memoriesファイルが破損しています: .agent/memories.md",
 *   { path: ".agent/memories.md" }
 * );
 *
 * // サイズ上限超過時
 * throw new MemoryError(
 *   "memoriesファイルがサイズ上限を超えました（100KB）",
 *   { currentSize: 150000, maxSize: 102400 }
 * );
 * ```
 */
export class MemoryError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "MEMORY_ERROR",
			details,
		});
		this.name = "MemoryError";
	}
}

/**
 * Taskエラー
 *
 * Tasksシステム（F-015）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // 依存タスク不存在
 * throw new TaskError(
 *   "依存タスクが見つかりません: task-999",
 *   { taskId: "task-002", missingDependency: "task-999" }
 * );
 *
 * // タスクファイル破損
 * throw new TaskError(
 *   "tasksファイルが破損しています",
 *   { path: ".agent/tasks.jsonl", line: 5 }
 * );
 * ```
 */
export class TaskError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "TASK_ERROR",
			details,
		});
		this.name = "TaskError";
	}
}

/**
 * セッション記録エラー
 *
 * Session Recording（F-016）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // 書き込み失敗
 * throw new SessionRecordError(
 *   "セッション記録の書き込みに失敗しました",
 *   { path: "session.jsonl", cause: "EACCES" }
 * );
 *
 * // リプレイファイル不正
 * throw new SessionRecordError(
 *   "リプレイファイルの形式が不正です",
 *   { path: "session.jsonl", line: 3 }
 * );
 * ```
 */
export class SessionRecordError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "SESSION_RECORD_ERROR",
			details,
		});
		this.name = "SessionRecordError";
	}
}

/**
 * Worktreeエラー
 *
 * Multi-Loop Concurrency（F-017）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // worktree作成失敗
 * throw new WorktreeError(
 *   "worktreeの作成に失敗しました",
 *   { path: ".worktrees/orch-20260126-a3f2", cause: "branch exists" }
 * );
 *
 * // マージ失敗
 * throw new WorktreeError(
 *   "自動マージに失敗しました。手動での解決が必要です。",
 *   { loopId: "orch-20260126-a3f2", conflicts: ["src/index.ts"] }
 * );
 * ```
 */
export class WorktreeError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "WORKTREE_ERROR",
			details,
		});
		this.name = "WorktreeError";
	}
}

/**
 * バックエンド選択エラー
 *
 * Per-Hat Backend Configuration（F-018）およびCustom Backends（F-019）で
 * 発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // バックエンド利用不可
 * throw new BackendSelectionError(
 *   "バックエンド 'gemini' が見つかりません",
 *   { backend: "gemini", hat: "reviewer" }
 * );
 *
 * // カスタムバックエンド設定不正
 * throw new BackendSelectionError(
 *   "カスタムバックエンドの設定が不正です",
 *   { command: "my-agent", error: "command not found" }
 * );
 * ```
 */
export class BackendSelectionError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "BACKEND_SELECTION_ERROR",
			details,
		});
		this.name = "BackendSelectionError";
	}
}

/**
 * Globパターンエラー
 *
 * Glob Pattern Event Matching（F-021）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // 曖昧なルーティング
 * throw new GlobPatternError(
 *   "複数のHatが同じパターンでマッチしました",
 *   { topic: "build.done", matchedHats: ["builder", "tester"] }
 * );
 *
 * // パターン構文エラー
 * throw new GlobPatternError(
 *   "無効なglobパターン: [invalid",
 *   { pattern: "[invalid", hat: "builder" }
 * );
 * ```
 */
export class GlobPatternError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "GLOB_PATTERN_ERROR",
			details,
		});
		this.name = "GlobPatternError";
	}
}

// v2.0.0 新規エラークラス

/**
 * ハイブリッド環境エラー
 *
 * Worktree + Container-Use統合（F-202）で発生するエラーを表現します。
 *
 * @example
 * ```typescript
 * // worktree作成失敗
 * throw new HybridEnvironmentError(
 *   "worktree作成失敗: .worktrees/issue-42",
 *   { issueNumber: 42, cause: "branch already exists" }
 * );
 *
 * // container-use環境作成失敗
 * throw new HybridEnvironmentError(
 *   "container-use環境作成失敗",
 *   { issueNumber: 42, worktreePath: ".worktrees/issue-42", stderr: "connection refused" }
 * );
 *
 * // 環境削除失敗
 * throw new HybridEnvironmentError(
 *   "環境削除失敗",
 *   { issueNumber: 42, environmentId: "env-123" }
 * );
 * ```
 */
export class HybridEnvironmentError extends SandboxError {
	constructor(message: string, details?: Record<string, unknown>) {
		super(message, {
			code: "HYBRID_ENVIRONMENT_ERROR",
			details,
		});
		this.name = "HybridEnvironmentError";
	}
}
