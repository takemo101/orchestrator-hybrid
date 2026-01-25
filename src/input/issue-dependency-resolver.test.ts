import { beforeEach, describe, expect, it, type Mock, mock } from "bun:test";
import { CircularDependencyError } from "../core/errors.js";
import type { ProcessExecutor, ProcessResult } from "../core/process-executor.js";
import { IssueDependencyResolver } from "./issue-dependency-resolver.js";

describe("IssueDependencyResolver", () => {
	let mockExecutor: ProcessExecutor;
	let spawnMock: Mock<(cmd: string, args: string[]) => Promise<ProcessResult>>;

	beforeEach(() => {
		spawnMock = mock(() => Promise.resolve({ stdout: "", stderr: "", exitCode: 0 }));
		mockExecutor = {
			spawn: spawnMock,
		};
	});

	describe("constructor", () => {
		it("デフォルトのProcessExecutorで初期化できる", () => {
			const resolver = new IssueDependencyResolver();
			expect(resolver).toBeInstanceOf(IssueDependencyResolver);
		});

		it("カスタムProcessExecutorで初期化できる", () => {
			const resolver = new IssueDependencyResolver(mockExecutor);
			expect(resolver).toBeInstanceOf(IssueDependencyResolver);
		});
	});

	describe("getDependencies", () => {
		it("依存関係を正しく取得する", async () => {
			let callCount = 0;
			spawnMock.mockImplementation(() => {
				callCount++;
				switch (callCount) {
					case 1: // blocked_by
						return Promise.resolve({
							stdout: "41\n43",
							stderr: "",
							exitCode: 0,
						});
					case 2: // blocking
						return Promise.resolve({ stdout: "45", stderr: "", exitCode: 0 });
					case 3: // issue view
						return Promise.resolve({
							stdout: JSON.stringify({ state: "OPEN" }),
							stderr: "",
							exitCode: 0,
						});
					default:
						return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.getDependencies(42);

			expect(result).toEqual({
				issueNumber: 42,
				blockedBy: [41, 43],
				blocking: [45],
				state: "open",
			});
		});

		it("依存関係がない場合は空配列を返す", async () => {
			let callCount = 0;
			spawnMock.mockImplementation(() => {
				callCount++;
				if (callCount <= 2) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.getDependencies(42);

			expect(result.blockedBy).toEqual([]);
			expect(result.blocking).toEqual([]);
		});

		it("closedのIssueを正しく判定する", async () => {
			let callCount = 0;
			spawnMock.mockImplementation(() => {
				callCount++;
				if (callCount <= 2) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({
					stdout: JSON.stringify({ state: "CLOSED" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.getDependencies(42);

			expect(result.state).toBe("closed");
		});

		it("API失敗時はデフォルト値を使用する", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({ stdout: "", stderr: "error", exitCode: 1 }),
			);

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.getDependencies(42);

			expect(result.blockedBy).toEqual([]);
			expect(result.blocking).toEqual([]);
			expect(result.state).toBe("open");
		});
	});

	describe("resolveOrder", () => {
		it("空配列は空配列を返す", async () => {
			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.resolveOrder([]);

			expect(result).toEqual([]);
		});

		it("単一Issueはそのまま返す", async () => {
			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.resolveOrder([42]);

			expect(result).toEqual([42]);
		});

		it("依存関係に基づいてソートする", async () => {
			// Issue 43 -> 42 -> 44 の依存関係
			// 43は依存なし、42は43に依存、44は42に依存
			const mockDeps: Record<number, { blockedBy: number[]; blocking: number[] }> = {
				42: { blockedBy: [43], blocking: [44] },
				43: { blockedBy: [], blocking: [42] },
				44: { blockedBy: [42], blocking: [] },
			};

			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				// blocked_by または blocking のAPI呼び出しからIssue番号を抽出
				const issueMatch = args[1]?.match(/issues\/(\d+)/);
				if (issueMatch) {
					const issueNum = Number(issueMatch[1]);
					const deps = mockDeps[issueNum] ?? { blockedBy: [], blocking: [] };

					if (args[1]?.includes("blocked_by")) {
						return Promise.resolve({
							stdout: deps.blockedBy.join("\n"),
							stderr: "",
							exitCode: 0,
						});
					}
					if (args[1]?.includes("blocking")) {
						return Promise.resolve({
							stdout: deps.blocking.join("\n"),
							stderr: "",
							exitCode: 0,
						});
					}
				}

				// issue view コマンド
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.resolveOrder([42, 43, 44]);

			// 43 -> 42 -> 44 の順序
			expect(result.indexOf(43)).toBeLessThan(result.indexOf(42));
			expect(result.indexOf(42)).toBeLessThan(result.indexOf(44));
		});

		it("依存関係がない場合は番号順でソートする", async () => {
			// 依存関係なし
			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				if (args[1]?.includes("blocked_by") || args[1]?.includes("blocking")) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.resolveOrder([44, 42, 43]);

			// 番号順
			expect(result).toEqual([42, 43, 44]);
		});
	});

	describe("detectCircularDependency", () => {
		it("循環依存を検出してエラーをスローする", async () => {
			// 42 -> 43 -> 44 -> 42 の循環
			const mockDeps: Record<number, { blockedBy: number[]; blocking: number[] }> = {
				42: { blockedBy: [44], blocking: [43] },
				43: { blockedBy: [42], blocking: [44] },
				44: { blockedBy: [43], blocking: [42] },
			};

			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				const issueMatch = args[1]?.match(/issues\/(\d+)/);
				if (issueMatch) {
					const issueNum = Number(issueMatch[1]);
					const deps = mockDeps[issueNum] ?? { blockedBy: [], blocking: [] };

					if (args[1]?.includes("blocked_by")) {
						return Promise.resolve({
							stdout: deps.blockedBy.join("\n"),
							stderr: "",
							exitCode: 0,
						});
					}
					if (args[1]?.includes("blocking")) {
						return Promise.resolve({
							stdout: deps.blocking.join("\n"),
							stderr: "",
							exitCode: 0,
						});
					}
				}
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);

			await expect(resolver.resolveOrder([42, 43, 44])).rejects.toThrow(CircularDependencyError);
		});

		it("循環依存のエラーメッセージに循環パスが含まれる", async () => {
			const mockDeps: Record<number, { blockedBy: number[]; blocking: number[] }> = {
				42: { blockedBy: [43], blocking: [] },
				43: { blockedBy: [42], blocking: [] },
			};

			spawnMock.mockImplementation((_cmd: string, args: string[]) => {
				const issueMatch = args[1]?.match(/issues\/(\d+)/);
				if (issueMatch) {
					const issueNum = Number(issueMatch[1]);
					const deps = mockDeps[issueNum] ?? { blockedBy: [], blocking: [] };

					if (args[1]?.includes("blocked_by")) {
						return Promise.resolve({
							stdout: deps.blockedBy.join("\n"),
							stderr: "",
							exitCode: 0,
						});
					}
					if (args[1]?.includes("blocking")) {
						return Promise.resolve({
							stdout: deps.blocking.join("\n"),
							stderr: "",
							exitCode: 0,
						});
					}
				}
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);

			try {
				await resolver.resolveOrder([42, 43]);
				expect.unreachable("Should throw CircularDependencyError");
			} catch (error) {
				expect(error).toBeInstanceOf(CircularDependencyError);
				expect((error as CircularDependencyError).message).toContain("循環依存");
			}
		});
	});

	describe("checkDependenciesCompleted", () => {
		it("依存がすべて完了している場合はtrueを返す", async () => {
			let callCount = 0;
			spawnMock.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// blocked_by for issue 42
					return Promise.resolve({ stdout: "41", stderr: "", exitCode: 0 });
				}
				if (callCount === 2) {
					// blocking for issue 42
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				if (callCount === 3) {
					// state for issue 42
					return Promise.resolve({
						stdout: JSON.stringify({ state: "OPEN" }),
						stderr: "",
						exitCode: 0,
					});
				}
				// 依存Issue 41のblocked_by
				if (callCount === 4) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				// 依存Issue 41のblocking
				if (callCount === 5) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				// 依存Issue 41の状態 -> CLOSED
				return Promise.resolve({
					stdout: JSON.stringify({ state: "CLOSED" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.checkDependenciesCompleted(42);

			expect(result).toBe(true);
		});

		it("依存が未完了の場合はfalseを返す", async () => {
			let callCount = 0;
			spawnMock.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					return Promise.resolve({ stdout: "41", stderr: "", exitCode: 0 });
				}
				if (callCount === 2) {
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				// すべてOPEN状態
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.checkDependenciesCompleted(42);

			expect(result).toBe(false);
		});

		it("依存がない場合はtrueを返す", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
			);

			const resolver = new IssueDependencyResolver(mockExecutor);
			const result = await resolver.checkDependenciesCompleted(42);

			expect(result).toBe(true);
		});
	});

	describe("generateDependencyReport", () => {
		it("依存関係レポートを生成する", async () => {
			let callCount = 0;
			spawnMock.mockImplementation(() => {
				callCount++;
				if (callCount === 1) {
					// blocked_by for issue 42
					return Promise.resolve({ stdout: "41", stderr: "", exitCode: 0 });
				}
				if (callCount === 2) {
					// blocking for issue 42
					return Promise.resolve({ stdout: "45", stderr: "", exitCode: 0 });
				}
				if (callCount === 3) {
					// state for issue 42
					return Promise.resolve({
						stdout: JSON.stringify({ state: "OPEN" }),
						stderr: "",
						exitCode: 0,
					});
				}
				// 依存Issue 41の情報
				if (callCount <= 6) {
					if (callCount === 6) {
						return Promise.resolve({
							stdout: JSON.stringify({ state: "CLOSED" }),
							stderr: "",
							exitCode: 0,
						});
					}
					return Promise.resolve({ stdout: "", stderr: "", exitCode: 0 });
				}
				return Promise.resolve({
					stdout: JSON.stringify({ state: "OPEN" }),
					stderr: "",
					exitCode: 0,
				});
			});

			const resolver = new IssueDependencyResolver(mockExecutor);
			const report = await resolver.generateDependencyReport(42);

			expect(report).toContain("Issue #42 の依存関係:");
			expect(report).toContain("依存元（blockedBy）:");
			expect(report).toContain("#41");
			expect(report).toContain("ブロック先（blocking）:");
			expect(report).toContain("#45");
		});

		it("依存がない場合はなしと表示する", async () => {
			spawnMock.mockImplementation(() =>
				Promise.resolve({
					stdout: "",
					stderr: "",
					exitCode: 0,
				}),
			);

			const resolver = new IssueDependencyResolver(mockExecutor);
			const report = await resolver.generateDependencyReport(42);

			expect(report).toContain("なし");
			expect(report).toContain("すべての依存Issueが完了");
		});
	});
});
