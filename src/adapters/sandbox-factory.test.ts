/**
 * SandboxFactory テスト
 *
 * SandboxFactory が設定に基づいて適切な SandboxAdapter を返すことを検証
 */

import { describe, expect, test } from "bun:test";
import { EnvironmentUnavailableError } from "../core/errors.js";
import type { ProcessExecutor, ProcessResult, SpawnOptions } from "../core/process-executor.js";
import type { Config } from "../core/types.js";
import { ContainerAdapter } from "./container-adapter.js";
import { DockerAdapter } from "./docker-adapter.js";
import { HostAdapter } from "./host-adapter.js";
import { SandboxFactory } from "./sandbox-factory.js";

/**
 * モックProcessExecutorを作成
 */
function createMockExecutor(options: {
	dockerAvailable?: boolean;
	cuAvailable?: boolean;
}): ProcessExecutor {
	const dockerAvailable = options.dockerAvailable ?? false;
	const cuAvailable = options.cuAvailable ?? false;

	return {
		spawn: async (
			command: string,
			args: string[],
			_opts?: SpawnOptions,
		): Promise<ProcessResult> => {
			// docker --version
			if (command === "docker" && args[0] === "--version") {
				return dockerAvailable
					? { stdout: "Docker version 24.0.0", stderr: "", exitCode: 0 }
					: { stdout: "", stderr: "command not found", exitCode: 127 };
			}

			// cu --version
			if (command === "cu" && args[0] === "--version") {
				return cuAvailable
					? { stdout: "container-use 1.0.0", stderr: "", exitCode: 0 }
					: { stdout: "", stderr: "command not found", exitCode: 127 };
			}

			return { stdout: "", stderr: "", exitCode: 0 };
		},
	};
}

/**
 * 最小限のConfig（sandbox設定なし）
 */
const minimalConfig: Config = {
	version: "1.0",
	backend: { type: "claude" },
	loop: {
		max_iterations: 100,
		completion_promise: "LOOP_COMPLETE",
		idle_timeout_secs: 1800,
	},
};

/**
 * sandbox設定を含むConfig型（Issue #13 完了まで暫定）
 */
interface ConfigWithSandbox extends Config {
	sandbox?: {
		type?: "docker" | "container-use" | "host";
		fallback?: "docker" | "container-use" | "host";
		docker?: {
			image?: string;
			network?: "none" | "bridge" | "host";
			timeout?: number;
		};
		containerUse?: {
			image?: string;
			envId?: string;
		};
		host?: {
			timeout?: number;
			warnOnStart?: boolean;
		};
	};
}

describe("SandboxFactory", () => {
	describe("create()", () => {
		test("sandbox設定がない場合、container-useをデフォルトで試行する", async () => {
			const executor = createMockExecutor({ cuAvailable: true });
			const adapter = await SandboxFactory.create(minimalConfig, executor);

			expect(adapter).toBeInstanceOf(ContainerAdapter);
			expect(adapter.name).toBe("container-use");
		});

		test("sandbox設定がなくcuが利用不可の場合、EnvironmentUnavailableErrorをスローする", async () => {
			const executor = createMockExecutor({ cuAvailable: false, dockerAvailable: false });

			await expect(SandboxFactory.create(minimalConfig, executor)).rejects.toThrow(
				EnvironmentUnavailableError,
			);
		});

		test("type=dockerが指定された場合、DockerAdapterを返す", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: { type: "docker" },
			};
			const executor = createMockExecutor({ dockerAvailable: true });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(DockerAdapter);
			expect(adapter.name).toBe("docker");
		});

		test("type=hostが指定された場合、HostAdapterを返す", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: { type: "host" },
			};
			const executor = createMockExecutor({});

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(HostAdapter);
			expect(adapter.name).toBe("host");
		});

		test("type=container-useが指定された場合、ContainerAdapterを返す", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: { type: "container-use" },
			};
			const executor = createMockExecutor({ cuAvailable: true });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(ContainerAdapter);
			expect(adapter.name).toBe("container-use");
		});
	});

	describe("フォールバック動作", () => {
		test("プライマリ環境が利用不可でフォールバックが利用可能な場合、フォールバックを使用する", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
					fallback: "host",
				},
			};
			const executor = createMockExecutor({ dockerAvailable: false });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(HostAdapter);
			expect(adapter.name).toBe("host");
		});

		test("プライマリもフォールバックも利用不可の場合、EnvironmentUnavailableErrorをスローする", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
					fallback: "container-use",
				},
			};
			const executor = createMockExecutor({ dockerAvailable: false, cuAvailable: false });

			await expect(SandboxFactory.create(config, executor)).rejects.toThrow(
				EnvironmentUnavailableError,
			);
		});

		test("フォールバックが設定されていない場合、プライマリ不可でエラーをスローする", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
				},
			};
			const executor = createMockExecutor({ dockerAvailable: false });

			await expect(SandboxFactory.create(config, executor)).rejects.toThrow(
				EnvironmentUnavailableError,
			);
		});

		test("docker -> container-use フォールバック", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
					fallback: "container-use",
				},
			};
			const executor = createMockExecutor({ dockerAvailable: false, cuAvailable: true });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(ContainerAdapter);
			expect(adapter.name).toBe("container-use");
		});

		test("container-use -> host フォールバック", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "container-use",
					fallback: "host",
				},
			};
			const executor = createMockExecutor({ cuAvailable: false });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(HostAdapter);
		});
	});

	describe("設定値の反映", () => {
		test("DockerAdapterに設定値が渡される", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
					docker: {
						image: "custom:image",
						network: "none",
						timeout: 600,
					},
				},
			};
			const executor = createMockExecutor({ dockerAvailable: true });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(DockerAdapter);
			// DockerAdapterの内部設定は直接アクセスできないが、正しくインスタンス化されていることを確認
		});

		test("ContainerAdapterに設定値が渡される", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "container-use",
					containerUse: {
						image: "node:20",
						envId: "existing-env",
					},
				},
			};
			const executor = createMockExecutor({ cuAvailable: true });

			const adapter = (await SandboxFactory.create(config, executor)) as ContainerAdapter;

			expect(adapter).toBeInstanceOf(ContainerAdapter);
			// envIdが設定されていることを確認
			expect(adapter.getEnvironmentId()).toBe("existing-env");
		});

		test("HostAdapterに設定値が渡される", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "host",
					host: {
						timeout: 600000,
						warnOnStart: false,
					},
				},
			};
			const executor = createMockExecutor({});

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(HostAdapter);
		});
	});

	describe("未知のタイプ", () => {
		test("未知のsandboxタイプでエラーをスローする", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "unknown" as "docker", // 型チェックを回避
				},
			};
			const executor = createMockExecutor({});

			await expect(SandboxFactory.create(config, executor)).rejects.toThrow(
				"Unknown sandbox type: unknown",
			);
		});
	});

	describe("エラーメッセージ", () => {
		test("EnvironmentUnavailableErrorに試行した環境タイプが含まれる", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
					fallback: "container-use",
				},
			};
			const executor = createMockExecutor({ dockerAvailable: false, cuAvailable: false });

			try {
				await SandboxFactory.create(config, executor);
				expect(true).toBe(false); // ここには到達しない
			} catch (error) {
				expect(error).toBeInstanceOf(EnvironmentUnavailableError);
				expect((error as Error).message).toContain("docker");
				expect((error as Error).message).toContain("container-use");
			}
		});

		test("フォールバックがない場合、プライマリのみがエラーメッセージに含まれる", async () => {
			const config: ConfigWithSandbox = {
				...minimalConfig,
				sandbox: {
					type: "docker",
				},
			};
			const executor = createMockExecutor({ dockerAvailable: false });

			try {
				await SandboxFactory.create(config, executor);
				expect(true).toBe(false);
			} catch (error) {
				expect(error).toBeInstanceOf(EnvironmentUnavailableError);
				expect((error as Error).message).toContain("docker");
				expect((error as Error).message).not.toContain("container-use");
			}
		});
	});
});
