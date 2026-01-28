/**
 * SessionManagerFactory テスト
 */

import { describe, expect, it } from "bun:test";
import { SessionManagerFactory } from "./factory";
import { NativeSessionManager } from "./native";
import { isTmuxAvailable, TmuxSessionManager } from "./tmux";

describe("SessionManagerFactory", () => {
	describe("create", () => {
		it("type='native'でNativeSessionManagerを生成する", async () => {
			const manager = await SessionManagerFactory.create("native");
			expect(manager).toBeInstanceOf(NativeSessionManager);
		});

		it("type='tmux'でTmuxSessionManagerを生成する（tmuxが利用可能な場合）", async () => {
			const available = await isTmuxAvailable();
			if (!available) {
				await expect(SessionManagerFactory.create("tmux")).rejects.toThrow(/not available/);
				return;
			}

			const manager = await SessionManagerFactory.create("tmux");
			expect(manager).toBeInstanceOf(TmuxSessionManager);
		});

		it("type='zellij'でエラーをスローする（未実装）", async () => {
			await expect(SessionManagerFactory.create("zellij")).rejects.toThrow(/not implemented/);
		});

		it("type='auto'で自動検出される", async () => {
			const manager = await SessionManagerFactory.create("auto");

			// tmuxが利用可能ならTmux、なければNative
			const tmuxAvailable = await isTmuxAvailable();
			if (tmuxAvailable) {
				expect(manager).toBeInstanceOf(TmuxSessionManager);
			} else {
				expect(manager).toBeInstanceOf(NativeSessionManager);
			}
		});

		it("オプションでbaseDirを指定できる", async () => {
			const manager = (await SessionManagerFactory.create("native", {
				baseDir: ".custom-sessions",
			})) as NativeSessionManager;
			expect(manager).toBeInstanceOf(NativeSessionManager);
		});

		it("オプションでprefixを指定できる", async () => {
			const available = await isTmuxAvailable();
			if (!available) {
				console.log("Skipping: tmux not available");
				return;
			}

			const manager = await SessionManagerFactory.create("tmux", { prefix: "custom" });
			expect(manager).toBeInstanceOf(TmuxSessionManager);
		});
	});

	describe("detectAvailable", () => {
		it("少なくともnativeが含まれる", async () => {
			const available = await SessionManagerFactory.detectAvailable();
			expect(available).toContain("native");
		});

		it("tmuxが利用可能な環境ではtmuxも含まれる", async () => {
			const tmuxAvailable = await isTmuxAvailable();
			const available = await SessionManagerFactory.detectAvailable();

			if (tmuxAvailable) {
				expect(available).toContain("tmux");
			}
		});
	});
});
