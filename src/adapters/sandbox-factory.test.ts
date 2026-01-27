import { describe, expect, test } from "bun:test";
import { EnvironmentUnavailableError } from "../core/errors.js";
import type { ProcessExecutor, ProcessResult, SpawnOptions } from "../core/process-executor.js";
import type { Config } from "../core/types.js";
import { DockerAdapter } from "./docker-adapter.js";
import { HostAdapter } from "./host-adapter.js";
import { SandboxFactory } from "./sandbox-factory.js";

function createMockExecutor(options: { dockerAvailable?: boolean }): ProcessExecutor {
	const dockerAvailable = options.dockerAvailable ?? false;

	return {
		spawn: async (
			command: string,
			args: string[],
			_opts?: SpawnOptions,
		): Promise<ProcessResult> => {
			if (command === "docker" && args[0] === "--version") {
				return dockerAvailable
					? { stdout: "Docker version 24.0.0", stderr: "", exitCode: 0 }
					: { stdout: "", stderr: "command not found", exitCode: 127 };
			}

			return { stdout: "", stderr: "", exitCode: 0 };
		},
	};
}

const minimalConfig: Config = {
	version: "1.0",
	backend: { type: "claude" },
	loop: {
		max_iterations: 100,
		completion_promise: "LOOP_COMPLETE",
		idle_timeout_secs: 1800,
	},
};

describe("SandboxFactory", () => {
	describe("create()", () => {
		test("sandbox設定がない場合、dockerをデフォルトで試行する", async () => {
			const executor = createMockExecutor({ dockerAvailable: true });
			const adapter = await SandboxFactory.create(minimalConfig, executor);

			expect(adapter).toBeInstanceOf(DockerAdapter);
			expect(adapter.name).toBe("docker");
		});

		test("sandbox設定がなくdockerが利用不可の場合、EnvironmentUnavailableErrorをスローする", async () => {
			const executor = createMockExecutor({ dockerAvailable: false });

			await expect(SandboxFactory.create(minimalConfig, executor)).rejects.toThrow(
				EnvironmentUnavailableError,
			);
		});

		test("type=dockerが指定された場合、DockerAdapterを返す", async () => {
			const config: Config = {
				...minimalConfig,
				sandbox: { type: "docker" },
			};
			const executor = createMockExecutor({ dockerAvailable: true });

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(DockerAdapter);
			expect(adapter.name).toBe("docker");
		});

		test("type=hostが指定された場合、HostAdapterを返す", async () => {
			const config: Config = {
				...minimalConfig,
				sandbox: { type: "host" },
			};
			const executor = createMockExecutor({});

			const adapter = await SandboxFactory.create(config, executor);

			expect(adapter).toBeInstanceOf(HostAdapter);
			expect(adapter.name).toBe("host");
		});
	});

	describe("フォールバック動作", () => {
		test("プライマリ環境が利用不可でフォールバックが利用可能な場合、フォールバックを使用する", async () => {
			const config: Config = {
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

		test("フォールバックが設定されていない場合、プライマリ不可でエラーをスローする", async () => {
			const config: Config = {
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
	});

	describe("設定値の反映", () => {
		test("DockerAdapterに設定値が渡される", async () => {
			const config: Config = {
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
		});

		test("HostAdapterに設定値が渡される", async () => {
			const config: Config = {
				...minimalConfig,
				sandbox: {
					type: "host",
					host: {
						timeout: 600000,
						warn_on_start: false,
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
			const config: Config = {
				...minimalConfig,
				sandbox: {
					type: "unknown" as "docker",
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
			const config: Config = {
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
			}
		});
	});
});
