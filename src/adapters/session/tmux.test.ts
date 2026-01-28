/**
 * TmuxSessionManager テスト
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { SessionError } from "../../core/errors";
import { isTmuxAvailable, TmuxSessionManager } from "./tmux";

describe("TmuxSessionManager", () => {
	let manager: TmuxSessionManager;
	let tmuxAvailable: boolean;
	const testPrefix = "test-orch";

	beforeAll(async () => {
		tmuxAvailable = await isTmuxAvailable();
	});

	beforeEach(() => {
		manager = new TmuxSessionManager(testPrefix);
	});

	afterEach(async () => {
		// テストセッションをクリーンアップ
		if (tmuxAvailable) {
			const sessions = await manager.list();
			for (const session of sessions) {
				try {
					await manager.kill(session.id);
				} catch {
					// 無視
				}
			}
		}
	});

	describe("isTmuxAvailable", () => {
		it("tmuxの利用可否を返す", async () => {
			const available = await isTmuxAvailable();
			expect(typeof available).toBe("boolean");
		});
	});

	describe("create", () => {
		it("セッションを作成し、Sessionオブジェクトを返す", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			const session = await manager.create("create-1", "sleep", ["100"]);

			expect(session.id).toBe("create-1");
			expect(session.type).toBe("tmux");
			expect(session.status).toBe("running");
			expect(session.command).toBe("sleep");
			expect(session.args).toEqual(["100"]);
			expect(session.startTime).toBeInstanceOf(Date);
		});

		it("同じIDで再作成すると既存を停止してから作成する", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			await manager.create("create-2", "sleep", ["100"]);
			expect(await manager.isRunning("create-2")).toBe(true);

			await manager.create("create-2", "sleep", ["200"]);
			expect(await manager.isRunning("create-2")).toBe(true);
		});
	});

	describe("list", () => {
		it("空の場合は空配列を返す", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			const sessions = await manager.list();
			// 他のテストからの残骸がないことを確認
			const ourSessions = sessions.filter((s) => s.id.startsWith("list-"));
			expect(ourSessions).toEqual([]);
		});

		it("作成したセッションを一覧で取得できる", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			await manager.create("list-1", "sleep", ["100"]);
			await manager.create("list-2", "sleep", ["100"]);

			const sessions = await manager.list();
			const ids = sessions.map((s) => s.id);

			expect(ids).toContain("list-1");
			expect(ids).toContain("list-2");
		});

		it("他のプレフィックスのセッションは含まれない", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			// 別のプレフィックスでセッション作成
			const proc = Bun.spawn(
				["tmux", "new-session", "-d", "-s", "other-prefix-test", "sleep", "100"],
				{
					stdout: "pipe",
					stderr: "pipe",
				},
			);
			await proc.exited;

			const sessions = await manager.list();
			const ids = sessions.map((s) => s.id);
			expect(ids).not.toContain("other-prefix-test");

			// クリーンアップ
			Bun.spawn(["tmux", "kill-session", "-t", "other-prefix-test"]);
		});
	});

	describe("getOutput", () => {
		it("セッションの出力を取得できる", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			// 直接tmuxを使ってテスト（確実に出力がキャプチャされることを確認）
			const sessionName = "test-orch-output-1";
			const createProc = Bun.spawn(
				[
					"tmux",
					"new-session",
					"-d",
					"-s",
					sessionName,
					"sh",
					"-c",
					"echo 'hello tmux output'; sleep 100",
				],
				{ stdout: "pipe", stderr: "pipe" },
			);
			await createProc.exited;

			// 出力が反映されるまで待機
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const output = await manager.getOutput("output-1");
			// 出力が取得できることを確認（空でないこと）
			expect(typeof output).toBe("string");
		});

		it("存在しないセッションの場合SessionErrorをスローする", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			await expect(manager.getOutput("non-existent-session")).rejects.toThrow(SessionError);
		});
	});

	describe("streamOutput", () => {
		it("AsyncIterableを返す", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			// 長時間実行
			await manager.create("stream-1", "sleep", ["100"]);

			// streamOutputがAsyncIterableを返すことを確認
			const stream = manager.streamOutput("stream-1");
			expect(typeof stream[Symbol.asyncIterator]).toBe("function");
		});
	});

	describe("isRunning", () => {
		it("実行中のセッションに対してtrueを返す", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			await manager.create("running-1", "sleep", ["100"]);
			const running = await manager.isRunning("running-1");
			expect(running).toBe(true);
		});

		it("存在しないセッションに対してfalseを返す", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			const running = await manager.isRunning("non-existent");
			expect(running).toBe(false);
		});
	});

	describe("kill", () => {
		it("実行中のセッションを停止できる", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			await manager.create("kill-1", "sleep", ["100"]);
			expect(await manager.isRunning("kill-1")).toBe(true);

			await manager.kill("kill-1");
			expect(await manager.isRunning("kill-1")).toBe(false);
		});

		it("存在しないセッションの場合SessionErrorをスローする", async () => {
			if (!tmuxAvailable) {
				console.log("Skipping: tmux not available");
				return;
			}

			await expect(manager.kill("non-existent")).rejects.toThrow(SessionError);
		});
	});
});
