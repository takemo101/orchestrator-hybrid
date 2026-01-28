/**
 * SessionManagerFactory
 *
 * セッションマネージャーの生成と自動検出をカプセル化する。
 */

import type { ISessionManager, SessionManagerType } from "./interface";
import { NativeSessionManager } from "./native";
import { TmuxSessionManager, isTmuxAvailable } from "./tmux";

/**
 * コマンドが実行可能かチェック
 */
async function canRun(command: string): Promise<boolean> {
	try {
		const proc = Bun.spawn([command, "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}

/**
 * セッションマネージャーファクトリー
 *
 * 指定されたタイプ、または自動検出に基づいてマネージャーを生成する。
 */
export class SessionManagerFactory {
	/**
	 * セッションマネージャーを生成
	 *
	 * 優先順位:
	 * 1. 明示的指定 (native/tmux/zellij)
	 * 2. tmux検出
	 * 3. zellij検出
	 * 4. native (フォールバック)
	 */
	static async create(
		type: SessionManagerType = "auto",
		options?: { baseDir?: string; prefix?: string },
	): Promise<ISessionManager> {
		const { baseDir = ".agent/sessions", prefix = "orch" } = options ?? {};

		// 明示的指定
		if (type === "native") {
			return new NativeSessionManager(baseDir);
		}
		if (type === "tmux") {
			if (!(await isTmuxAvailable())) {
				throw new Error("tmux is not available on this system");
			}
			return new TmuxSessionManager(prefix);
		}
		if (type === "zellij") {
			// Zellij は Issue #126 で実装予定
			throw new Error("zellij session manager is not implemented yet");
		}

		// 自動検出
		if (await isTmuxAvailable()) {
			return new TmuxSessionManager(prefix);
		}

		// zellijチェック（将来対応）
		if (await canRun("zellij")) {
			// Zellij は Issue #126 で実装予定
			// return new ZellijSessionManager(prefix);
		}

		// フォールバック: Native
		return new NativeSessionManager(baseDir);
	}

	/**
	 * 利用可能なセッションマネージャーの種別を検出
	 */
	static async detectAvailable(): Promise<SessionManagerType[]> {
		const available: SessionManagerType[] = ["native"];

		if (await isTmuxAvailable()) {
			available.push("tmux");
		}

		if (await canRun("zellij")) {
			available.push("zellij");
		}

		return available;
	}
}
