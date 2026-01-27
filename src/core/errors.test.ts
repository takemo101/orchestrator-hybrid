/**
 * SandboxError エラークラス階層のテスト
 * Issue #7: TDD Red Phase - テストを先に作成
 */
import { describe, expect, it } from "bun:test";
import {
	BackendSelectionError,
	CircularDependencyError,
	ContainerUseError,
	DockerNotFoundError,
	DockerTimeoutError,
	EnvironmentUnavailableError,
	ExecutionTimeoutError,
	GlobPatternError,
	HostExecutionError,
	ImagePullError,
	IssueDependencyError,
	LogMonitorError,
	MemoryError,
	PRAutoMergeError,
	ProcessExecutionError,
	SandboxError,
	SessionRecordError,
	TaskError,
	WorktreeError,
} from "./errors.js";

describe("SandboxError", () => {
	describe("基底クラス", () => {
		it("メッセージとcodeで初期化できる", () => {
			const error = new SandboxError("Test error", { code: "TEST_CODE" });

			expect(error.message).toBe("Test error");
			expect(error.code).toBe("TEST_CODE");
			expect(error.name).toBe("SandboxError");
		});

		it("codeが省略された場合はSANDBOX_ERRORになる", () => {
			const error = new SandboxError("Test error");

			expect(error.code).toBe("SANDBOX_ERROR");
		});

		it("detailsを設定できる", () => {
			const error = new SandboxError("Test error", {
				code: "TEST_CODE",
				details: { foo: "bar", count: 42 },
			});

			expect(error.details).toEqual({ foo: "bar", count: 42 });
		});

		it("causeを設定できる", () => {
			const cause = new Error("Original error");
			const error = new SandboxError("Wrapped error", { cause });

			expect(error.cause).toBe(cause);
		});

		it("toJSON()でJSON形式で取得できる", () => {
			const error = new SandboxError("Test error", {
				code: "TEST_CODE",
				details: { foo: "bar" },
			});

			const json = error.toJSON();

			expect(json.name).toBe("SandboxError");
			expect(json.code).toBe("TEST_CODE");
			expect(json.message).toBe("Test error");
			expect(json.details).toEqual({ foo: "bar" });
			expect(typeof json.stack).toBe("string");
		});

		it("Errorを継承している", () => {
			const error = new SandboxError("Test error");

			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(SandboxError);
		});
	});
});

describe("DockerNotFoundError", () => {
	it("デフォルトメッセージで初期化できる", () => {
		const error = new DockerNotFoundError();

		expect(error.message).toBe("Docker is not installed or not in PATH");
		expect(error.code).toBe("DOCKER_NOT_FOUND");
		expect(error.name).toBe("DockerNotFoundError");
	});

	it("カスタムメッセージで初期化できる", () => {
		const error = new DockerNotFoundError("Custom message");

		expect(error.message).toBe("Custom message");
	});

	it("SandboxErrorを継承している", () => {
		const error = new DockerNotFoundError();

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(DockerNotFoundError);
	});
});

describe("DockerTimeoutError", () => {
	it("タイムアウト値でメッセージを生成する", () => {
		const error = new DockerTimeoutError(5000);

		expect(error.message).toBe("Docker execution timed out after 5000ms");
		expect(error.code).toBe("DOCKER_TIMEOUT");
		expect(error.name).toBe("DockerTimeoutError");
		expect(error.timeout).toBe(5000);
	});

	it("detailsにtimeoutが含まれる", () => {
		const error = new DockerTimeoutError(3000);

		expect(error.details).toEqual({ timeout: 3000 });
	});

	it("SandboxErrorを継承している", () => {
		const error = new DockerTimeoutError(1000);

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(DockerTimeoutError);
	});
});

describe("HostExecutionError", () => {
	it("メッセージと終了コードで初期化できる", () => {
		const error = new HostExecutionError("Command failed", 1);

		expect(error.message).toBe("Command failed");
		expect(error.code).toBe("HOST_EXECUTION_ERROR");
		expect(error.name).toBe("HostExecutionError");
		expect(error.exitCode).toBe(1);
	});

	it("追加のdetailsを設定できる", () => {
		const error = new HostExecutionError("Command failed", 127, {
			command: "npm test",
		});

		expect(error.details).toEqual({ exitCode: 127, command: "npm test" });
	});

	it("SandboxErrorを継承している", () => {
		const error = new HostExecutionError("Error", 1);

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(HostExecutionError);
	});
});

describe("ProcessExecutionError", () => {
	it("メッセージで初期化できる", () => {
		const error = new ProcessExecutionError("Process failed");

		expect(error.message).toBe("Process failed");
		expect(error.code).toBe("PROCESS_EXECUTION_ERROR");
		expect(error.name).toBe("ProcessExecutionError");
	});

	it("causeとdetailsを設定できる", () => {
		const cause = new Error("Original error");
		const error = new ProcessExecutionError("Wrapped error", {
			cause,
			details: { command: "echo hello" },
		});

		expect(error.cause).toBe(cause);
		expect(error.details).toEqual({ command: "echo hello" });
	});

	it("SandboxErrorを継承している", () => {
		const error = new ProcessExecutionError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(ProcessExecutionError);
	});
});

describe("ContainerUseError", () => {
	it("メッセージで初期化できる", () => {
		const error = new ContainerUseError("Container failed");

		expect(error.message).toBe("Container failed");
		expect(error.code).toBe("CONTAINER_USE_ERROR");
		expect(error.name).toBe("ContainerUseError");
	});

	it("causeとdetailsを設定できる", () => {
		const cause = new Error("Original error");
		const error = new ContainerUseError("Wrapped error", {
			cause,
			details: { envId: "test-env" },
		});

		expect(error.cause).toBe(cause);
		expect(error.details).toEqual({ envId: "test-env" });
	});

	it("SandboxErrorを継承している", () => {
		const error = new ContainerUseError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(ContainerUseError);
	});
});

describe("EnvironmentUnavailableError", () => {
	it("環境タイプでメッセージを生成する", () => {
		const error = new EnvironmentUnavailableError("docker, host");

		expect(error.message).toBe("No available sandbox environment: tried docker, host");
		expect(error.code).toBe("ENVIRONMENT_UNAVAILABLE");
		expect(error.name).toBe("EnvironmentUnavailableError");
	});

	it("detailsに環境タイプが含まれる", () => {
		const error = new EnvironmentUnavailableError("container-use");

		expect(error.details).toEqual({ triedEnvironments: "container-use" });
	});

	it("SandboxErrorを継承している", () => {
		const error = new EnvironmentUnavailableError("docker");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(EnvironmentUnavailableError);
	});
});

describe("ExecutionTimeoutError", () => {
	it("タイムアウト値でメッセージを生成する", () => {
		const error = new ExecutionTimeoutError(10000);

		expect(error.message).toBe("Execution timed out after 10000ms");
		expect(error.code).toBe("EXECUTION_TIMEOUT");
		expect(error.name).toBe("ExecutionTimeoutError");
		expect(error.timeout).toBe(10000);
	});

	it("detailsにtimeoutが含まれる", () => {
		const error = new ExecutionTimeoutError(5000);

		expect(error.details).toEqual({ timeout: 5000 });
	});

	it("SandboxErrorを継承している", () => {
		const error = new ExecutionTimeoutError(1000);

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(ExecutionTimeoutError);
	});
});

describe("ImagePullError", () => {
	it("イメージ名でメッセージを生成する", () => {
		const error = new ImagePullError("node:20-alpine", "pull access denied");

		expect(error.message).toBe("Failed to pull Docker image: node:20-alpine");
		expect(error.code).toBe("IMAGE_PULL_ERROR");
		expect(error.name).toBe("ImagePullError");
		expect(error.image).toBe("node:20-alpine");
	});

	it("detailsにimageとstderrが含まれる", () => {
		const error = new ImagePullError("alpine:latest", "network error");

		expect(error.details).toEqual({
			image: "alpine:latest",
			stderr: "network error",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new ImagePullError("test", "error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(ImagePullError);
	});
});

// v1.3.0 新規エラークラス

describe("PRAutoMergeError", () => {
	it("メッセージで初期化できる", () => {
		const error = new PRAutoMergeError("PR #123 のCI失敗。マージを中断します。");

		expect(error.message).toBe("PR #123 のCI失敗。マージを中断します。");
		expect(error.code).toBe("PR_AUTO_MERGE_ERROR");
		expect(error.name).toBe("PRAutoMergeError");
	});

	it("detailsを設定できる", () => {
		const error = new PRAutoMergeError("PR #123 のCIがタイムアウトしました", {
			prNumber: 123,
			timeout: 600,
		});

		expect(error.details).toEqual({ prNumber: 123, timeout: 600 });
	});

	it("SandboxErrorを継承している", () => {
		const error = new PRAutoMergeError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(PRAutoMergeError);
	});
});

describe("LogMonitorError", () => {
	it("メッセージで初期化できる", () => {
		const error = new LogMonitorError("ログファイルが見つかりません");

		expect(error.message).toBe("ログファイルが見つかりません");
		expect(error.code).toBe("LOG_MONITOR_ERROR");
		expect(error.name).toBe("LogMonitorError");
	});

	it("detailsを設定できる", () => {
		const error = new LogMonitorError("ログファイルが見つかりません", {
			taskId: "task-123",
			logPath: ".agent/task-123/output.log",
		});

		expect(error.details).toEqual({
			taskId: "task-123",
			logPath: ".agent/task-123/output.log",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new LogMonitorError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(LogMonitorError);
	});
});

describe("CircularDependencyError", () => {
	it("メッセージで初期化できる", () => {
		const error = new CircularDependencyError("循環依存を検出: #42 -> #43 -> #44 -> #42");

		expect(error.message).toBe("循環依存を検出: #42 -> #43 -> #44 -> #42");
		expect(error.code).toBe("CIRCULAR_DEPENDENCY_ERROR");
		expect(error.name).toBe("CircularDependencyError");
	});

	it("detailsに循環のパスを設定できる", () => {
		const error = new CircularDependencyError("循環依存を検出", {
			cycle: [42, 43, 44, 42],
		});

		expect(error.details).toEqual({ cycle: [42, 43, 44, 42] });
	});

	it("SandboxErrorを継承している", () => {
		const error = new CircularDependencyError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(CircularDependencyError);
	});
});

describe("IssueDependencyError", () => {
	it("メッセージで初期化できる", () => {
		const error = new IssueDependencyError("Issue #42 の依存関係取得に失敗しました");

		expect(error.message).toBe("Issue #42 の依存関係取得に失敗しました");
		expect(error.code).toBe("ISSUE_DEPENDENCY_ERROR");
		expect(error.name).toBe("IssueDependencyError");
	});

	it("detailsを設定できる", () => {
		const error = new IssueDependencyError("依存関係取得に失敗", {
			issueNumber: 42,
			cause: "API error",
		});

		expect(error.details).toEqual({ issueNumber: 42, cause: "API error" });
	});

	it("SandboxErrorを継承している", () => {
		const error = new IssueDependencyError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(IssueDependencyError);
	});
});

// v1.4.0 新規エラークラス

describe("MemoryError (v1.4.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new MemoryError("memoriesファイルが破損しています");

		expect(error.message).toBe("memoriesファイルが破損しています");
		expect(error.code).toBe("MEMORY_ERROR");
		expect(error.name).toBe("MemoryError");
	});

	it("detailsを設定できる", () => {
		const error = new MemoryError("サイズ上限超過", {
			currentSize: 150000,
			maxSize: 102400,
		});

		expect(error.details).toEqual({ currentSize: 150000, maxSize: 102400 });
	});

	it("SandboxErrorを継承している", () => {
		const error = new MemoryError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(MemoryError);
	});
});

describe("TaskError (v1.4.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new TaskError("依存タスクが見つかりません");

		expect(error.message).toBe("依存タスクが見つかりません");
		expect(error.code).toBe("TASK_ERROR");
		expect(error.name).toBe("TaskError");
	});

	it("detailsを設定できる", () => {
		const error = new TaskError("依存タスクが見つかりません", {
			taskId: "task-002",
			missingDependency: "task-999",
		});

		expect(error.details).toEqual({
			taskId: "task-002",
			missingDependency: "task-999",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new TaskError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(TaskError);
	});
});

describe("SessionRecordError (v1.4.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new SessionRecordError("セッション記録の書き込みに失敗しました");

		expect(error.message).toBe("セッション記録の書き込みに失敗しました");
		expect(error.code).toBe("SESSION_RECORD_ERROR");
		expect(error.name).toBe("SessionRecordError");
	});

	it("detailsを設定できる", () => {
		const error = new SessionRecordError("書き込み失敗", {
			path: "session.jsonl",
			cause: "EACCES",
		});

		expect(error.details).toEqual({
			path: "session.jsonl",
			cause: "EACCES",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new SessionRecordError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(SessionRecordError);
	});
});

describe("WorktreeError (v1.4.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new WorktreeError("worktreeの作成に失敗しました");

		expect(error.message).toBe("worktreeの作成に失敗しました");
		expect(error.code).toBe("WORKTREE_ERROR");
		expect(error.name).toBe("WorktreeError");
	});

	it("detailsを設定できる", () => {
		const error = new WorktreeError("自動マージに失敗しました", {
			loopId: "orch-20260126-a3f2",
			conflicts: ["src/index.ts"],
		});

		expect(error.details).toEqual({
			loopId: "orch-20260126-a3f2",
			conflicts: ["src/index.ts"],
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new WorktreeError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(WorktreeError);
	});
});

describe("BackendSelectionError (v1.4.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new BackendSelectionError("バックエンド 'gemini' が見つかりません");

		expect(error.message).toBe("バックエンド 'gemini' が見つかりません");
		expect(error.code).toBe("BACKEND_SELECTION_ERROR");
		expect(error.name).toBe("BackendSelectionError");
	});

	it("detailsを設定できる", () => {
		const error = new BackendSelectionError("バックエンド選択失敗", {
			backend: "gemini",
			hat: "reviewer",
		});

		expect(error.details).toEqual({
			backend: "gemini",
			hat: "reviewer",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new BackendSelectionError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(BackendSelectionError);
	});
});

describe("GlobPatternError (v1.4.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new GlobPatternError("複数のHatが同じパターンでマッチしました");

		expect(error.message).toBe("複数のHatが同じパターンでマッチしました");
		expect(error.code).toBe("GLOB_PATTERN_ERROR");
		expect(error.name).toBe("GlobPatternError");
	});

	it("detailsを設定できる", () => {
		const error = new GlobPatternError("曖昧なルーティング", {
			topic: "build.done",
			matchedHats: ["builder", "tester"],
		});

		expect(error.details).toEqual({
			topic: "build.done",
			matchedHats: ["builder", "tester"],
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new GlobPatternError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(GlobPatternError);
	});
});

// v2.0.0 新規エラークラス

describe("HybridEnvironmentError (v2.0.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new HybridEnvironmentError("worktree作成失敗");

		expect(error.message).toBe("worktree作成失敗");
		expect(error.code).toBe("HYBRID_ENVIRONMENT_ERROR");
		expect(error.name).toBe("HybridEnvironmentError");
	});

	it("detailsを設定できる", () => {
		const error = new HybridEnvironmentError("worktree作成失敗", {
			issueNumber: 42,
			cause: "branch already exists",
		});

		expect(error.details).toEqual({
			issueNumber: 42,
			cause: "branch already exists",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new HybridEnvironmentError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(HybridEnvironmentError);
	});
});

describe("EnvironmentStateError (v2.0.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new EnvironmentStateError("環境状態更新失敗");

		expect(error.message).toBe("環境状態更新失敗");
		expect(error.code).toBe("ENVIRONMENT_STATE_ERROR");
		expect(error.name).toBe("EnvironmentStateError");
	});

	it("detailsを設定できる", () => {
		const error = new EnvironmentStateError("環境状態更新失敗", {
			issueNumber: 42,
			stderr: "permission denied",
		});

		expect(error.details).toEqual({
			issueNumber: 42,
			stderr: "permission denied",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new EnvironmentStateError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(EnvironmentStateError);
	});
});

describe("AutoCleanupError (v2.0.0)", () => {
	it("メッセージで初期化できる", () => {
		const error = new AutoCleanupError("worktree削除失敗");

		expect(error.message).toBe("worktree削除失敗");
		expect(error.code).toBe("AUTO_CLEANUP_ERROR");
		expect(error.name).toBe("AutoCleanupError");
	});

	it("detailsを設定できる", () => {
		const error = new AutoCleanupError("container-use環境削除失敗", {
			issueNumber: 42,
			environmentId: "abc-123",
		});

		expect(error.details).toEqual({
			issueNumber: 42,
			environmentId: "abc-123",
		});
	});

	it("SandboxErrorを継承している", () => {
		const error = new AutoCleanupError("Error");

		expect(error).toBeInstanceOf(SandboxError);
		expect(error).toBeInstanceOf(AutoCleanupError);
	});
});
