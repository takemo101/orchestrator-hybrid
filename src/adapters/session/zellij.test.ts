/**
 * ZellijSessionManager テスト
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { SessionError } from "../../core/errors";
import { isZellijAvailable, ZellijSessionManager } from "./zellij";

describe("ZellijSessionManager", () => {
	let manager: ZellijSessionManager;
	let zellijAvailable: boolean;
	const testPrefix = "test-orch";

	beforeAll(async () => {
		zellijAvailable = await isZellijAvailable();
	});

	beforeEach(() => {
		manager = new ZellijSessionManager(testPrefix);
	});

	afterEach(async () => {
		if (zellijAvailable) {
			const sessions = await manager.list();
			for (const session of sessions) {
				try {
					await manager.kill(session.id);
				} catch {
					// ignore
				}
			}
		}
	});

	describe("isZellijAvailable", () => {
		it("returns boolean for zellij availability", async () => {
			const available = await isZellijAvailable();
			expect(typeof available).toBe("boolean");
		});
	});

	describe("create", () => {
		it("creates session and returns Session object", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			const session = await manager.create("create-1", "sleep", ["100"]);

			expect(session.id).toBe("create-1");
			expect(session.type).toBe("zellij");
			expect(session.status).toBe("running");
			expect(session.command).toBe("sleep");
			expect(session.args).toEqual(["100"]);
			expect(session.startTime).toBeInstanceOf(Date);
		});

		it("recreates session by killing existing one first", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await manager.create("create-2", "sleep", ["100"]);
			expect(await manager.isRunning("create-2")).toBe(true);

			await manager.create("create-2", "sleep", ["200"]);
			expect(await manager.isRunning("create-2")).toBe(true);
		});
	});

	describe("list", () => {
		it("returns empty array when no sessions", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			const sessions = await manager.list();
			const ourSessions = sessions.filter((s) => s.id.startsWith("list-"));
			expect(ourSessions).toEqual([]);
		});

		it("lists created sessions", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await manager.create("list-1", "sleep", ["100"]);
			await manager.create("list-2", "sleep", ["100"]);

			const sessions = await manager.list();
			const ids = sessions.map((s) => s.id);

			expect(ids).toContain("list-1");
			expect(ids).toContain("list-2");
		});

		it("does not include sessions with different prefix", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			Bun.spawn(["zellij", "--session", "other-prefix-test", "--", "sleep", "100"], {
				stdout: "pipe",
				stderr: "pipe",
				stdin: "pipe",
			});
			await new Promise((resolve) => setTimeout(resolve, 1000));

			const sessions = await manager.list();
			const ids = sessions.map((s) => s.id);
			expect(ids).not.toContain("other-prefix-test");

			Bun.spawn(["zellij", "kill-session", "other-prefix-test"]);
		});
	});

	describe("getOutput", () => {
		it("retrieves session output", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			const sessionName = "test-orch-output-1";
			Bun.spawn(
				[
					"zellij",
					"--session",
					sessionName,
					"--",
					"sh",
					"-c",
					"echo 'hello zellij output'; sleep 100",
				],
				{ stdout: "pipe", stderr: "pipe", stdin: "pipe" },
			);
			await new Promise((resolve) => setTimeout(resolve, 2000));

			const output = await manager.getOutput("output-1");
			expect(typeof output).toBe("string");
		});

		it("throws SessionError for non-existent session", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await expect(manager.getOutput("non-existent-session")).rejects.toThrow(SessionError);
		});
	});

	describe("streamOutput", () => {
		it("returns AsyncIterable", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await manager.create("stream-1", "sleep", ["100"]);

			const stream = manager.streamOutput("stream-1");
			expect(typeof stream[Symbol.asyncIterator]).toBe("function");
		});
	});

	describe("isRunning", () => {
		it("returns true for running session", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await manager.create("running-1", "sleep", ["100"]);
			const running = await manager.isRunning("running-1");
			expect(running).toBe(true);
		});

		it("returns false for non-existent session", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			const running = await manager.isRunning("non-existent");
			expect(running).toBe(false);
		});
	});

	describe("kill", () => {
		it("kills running session", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await manager.create("kill-1", "sleep", ["100"]);
			expect(await manager.isRunning("kill-1")).toBe(true);

			await manager.kill("kill-1");
			expect(await manager.isRunning("kill-1")).toBe(false);
		});

		it("throws SessionError for non-existent session", async () => {
			if (!zellijAvailable) {
				console.log("Skipping: zellij not available");
				return;
			}

			await expect(manager.kill("non-existent")).rejects.toThrow(SessionError);
		});
	});
});
