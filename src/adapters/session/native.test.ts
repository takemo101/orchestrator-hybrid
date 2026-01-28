/**
 * NativeSessionManager テスト
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SessionError } from "../../core/errors";
import { NativeSessionManager } from "./native";

describe("NativeSessionManager", () => {
	const testBaseDir = ".test-sessions";
	let manager: NativeSessionManager;

	beforeEach(() => {
		// テストディレクトリをクリーンアップ
		if (fs.existsSync(testBaseDir)) {
			fs.rmSync(testBaseDir, { recursive: true });
		}
		manager = new NativeSessionManager(testBaseDir);
	});

	afterEach(async () => {
		// 実行中のセッションを停止
		const sessions = await manager.list();
		for (const session of sessions) {
			try {
				if (session.status === "running") {
					await manager.kill(session.id);
				}
			} catch {
				// 無視
			}
		}

		// 少し待ってからクリーンアップ（非同期処理の完了を待つ）
		await new Promise((resolve) => setTimeout(resolve, 100));

		// テストディレクトリをクリーンアップ
		if (fs.existsSync(testBaseDir)) {
			fs.rmSync(testBaseDir, { recursive: true });
		}
	});

	describe("create", () => {
		it("セッションを作成し、Sessionオブジェクトを返す", async () => {
			const session = await manager.create("test-1", "echo", ["hello"]);

			expect(session.id).toBe("test-1");
			expect(session.type).toBe("native");
			expect(session.status).toBe("running");
			expect(session.command).toBe("echo");
			expect(session.args).toEqual(["hello"]);
			expect(session.startTime).toBeInstanceOf(Date);
		});

		it("セッションディレクトリを作成する", async () => {
			await manager.create("test-2", "echo", ["world"]);

			const sessionDir = path.join(testBaseDir, "test-2");
			expect(fs.existsSync(sessionDir)).toBe(true);
		});

		it("session.jsonにメタデータを保存する", async () => {
			await manager.create("test-3", "echo", ["metadata"]);

			const metaPath = path.join(testBaseDir, "test-3", "session.json");
			expect(fs.existsSync(metaPath)).toBe(true);

			const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
			expect(meta.id).toBe("test-3");
			expect(meta.command).toBe("echo");
			expect(meta.args).toEqual(["metadata"]);
			expect(meta.status).toBe("running");
			expect(meta.pid).toBeGreaterThan(0);
		});

		it("同じIDで再作成すると既存を停止してから作成する", async () => {
			// 長時間実行するプロセス
			await manager.create("test-4", "sleep", ["10"]);
			const firstList = await manager.list();
			expect(firstList.length).toBe(1);

			// 同じIDで再作成
			await manager.create("test-4", "echo", ["new"]);
			const secondList = await manager.list();
			expect(secondList.length).toBe(1);
			expect(secondList[0].command).toBe("echo");
		});
	});

	describe("list", () => {
		it("空の場合は空配列を返す", async () => {
			const sessions = await manager.list();
			expect(sessions).toEqual([]);
		});

		it("作成したセッションを一覧で取得できる", async () => {
			await manager.create("list-1", "sleep", ["1"]);
			await manager.create("list-2", "sleep", ["1"]);

			const sessions = await manager.list();
			expect(sessions.length).toBe(2);
			expect(sessions.map((s) => s.id).sort()).toEqual(["list-1", "list-2"]);
		});
	});

	describe("getOutput", () => {
		it("セッションの出力を取得できる", async () => {
			await manager.create("output-1", "echo", ["hello world"]);

			// プロセス終了を待つ
			await new Promise((resolve) => setTimeout(resolve, 300));

			const output = await manager.getOutput("output-1");
			expect(output).toContain("hello world");
		});

		it("存在しないセッションの場合SessionErrorをスローする", async () => {
			await expect(manager.getOutput("non-existent")).rejects.toThrow(SessionError);
		});

		it("行数を指定して末尾を取得できる", async () => {
			// 複数行出力
			await manager.create("output-2", "sh", ["-c", "echo line1; echo line2; echo line3"]);

			// プロセス終了を待つ
			await new Promise((resolve) => setTimeout(resolve, 300));

			const output = await manager.getOutput("output-2", 2);
			const lines = output.split("\n").filter((l) => l);
			expect(lines.length).toBeLessThanOrEqual(2);
		});
	});

	describe("streamOutput", () => {
		it("出力をストリーミングで取得できる", async () => {
			await manager.create("stream-1", "sh", ["-c", "echo start; sleep 0.2; echo end"]);

			const chunks: string[] = [];
			for await (const chunk of manager.streamOutput("stream-1")) {
				chunks.push(chunk);
				if (chunk.includes("end")) break;
			}

			const fullOutput = chunks.join("");
			expect(fullOutput).toContain("start");
			expect(fullOutput).toContain("end");
		});

		it("存在しないセッションの場合SessionErrorをスローする", async () => {
			await expect(async () => {
				for await (const _ of manager.streamOutput("non-existent")) {
					// 何もしない
				}
			}).toThrow(SessionError);
		});
	});

	describe("attach", () => {
		it("Nativeモードではattachがサポートされずエラーをスローする", async () => {
			await manager.create("attach-1", "echo", ["test"]);
			await expect(manager.attach("attach-1")).rejects.toThrow(SessionError);
			await expect(manager.attach("attach-1")).rejects.toThrow(/not supported/);
		});
	});

	describe("isRunning", () => {
		it("実行中のセッションに対してtrueを返す", async () => {
			await manager.create("running-1", "sleep", ["10"]);
			const running = await manager.isRunning("running-1");
			expect(running).toBe(true);
		});

		it("終了したセッションに対してfalseを返す", async () => {
			await manager.create("running-2", "echo", ["done"]);

			// プロセス終了を待つ
			await new Promise((resolve) => setTimeout(resolve, 300));

			const running = await manager.isRunning("running-2");
			expect(running).toBe(false);
		});

		it("存在しないセッションに対してfalseを返す", async () => {
			const running = await manager.isRunning("non-existent");
			expect(running).toBe(false);
		});
	});

	describe("kill", () => {
		it("実行中のセッションを停止できる", async () => {
			await manager.create("kill-1", "sleep", ["10"]);
			expect(await manager.isRunning("kill-1")).toBe(true);

			await manager.kill("kill-1");

			// メタデータを確認
			const metaPath = path.join(testBaseDir, "kill-1", "session.json");
			const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
			expect(meta.status).toBe("stopped");
		});

		it("存在しないセッションの場合SessionErrorをスローする", async () => {
			await expect(manager.kill("non-existent")).rejects.toThrow(SessionError);
		});
	});
});
