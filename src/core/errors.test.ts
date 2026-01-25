/**
 * SandboxError エラークラス階層のテスト
 * Issue #7: TDD Red Phase - テストを先に作成
 */
import { describe, expect, it } from "bun:test";
import {
	CircularDependencyError,
	ContainerUseError,
	DockerNotFoundError,
	DockerTimeoutError,
	EnvironmentUnavailableError,
	ExecutionTimeoutError,
	HostExecutionError,
	ImagePullError,
	IssueDependencyError,
	LogMonitorError,
	PRAutoMergeError,
	ProcessExecutionError,
	SandboxError,
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
