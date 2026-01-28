/**
 * SessionManagerFactory
 *
 * セッションマネージャーの生成と自動検出を提供する。
 */

import type { ISessionManager, SessionManagerType } from "./interface";
import { NativeSessionManager } from "./native";
import { isTmuxAvailable, TmuxSessionManager } from "./tmux";
import { isZellijAvailable, ZellijSessionManager } from "./zellij";

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
 * セッションマネージャー生成オプション
 */
export interface SessionManagerOptions {
	baseDir?: string;
	prefix?: string;
}

/**
 * セッションマネージャーを生成
 *
 * 優先順位:
 * 1. 明示的指定 (native/tmux/zellij)
 * 2. tmux検出
 * 3. zellij検出
 * 4. native (フォールバック)
 */
export async function createSessionManager(
	type: SessionManagerType = "auto",
	options?: SessionManagerOptions,
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
		if (!(await isZellijAvailable())) {
			throw new Error("zellij is not available on this system");
		}
		return new ZellijSessionManager(prefix);
	}

	// 自動検出
	if (await isTmuxAvailable()) {
		return new TmuxSessionManager(prefix);
	}

	if (await isZellijAvailable()) {
		return new ZellijSessionManager(prefix);
	}

	// フォールバック: Native
	return new NativeSessionManager(baseDir);
}

/**
 * 利用可能なセッションマネージャーの種別を検出
 */
export async function detectAvailableSessionManagers(): Promise<SessionManagerType[]> {
	const available: SessionManagerType[] = ["native"];

	if (await isTmuxAvailable()) {
		available.push("tmux");
	}

	if (await canRun("zellij")) {
		available.push("zellij");
	}

	return available;
}

/**
 * SessionManagerFactory (後方互換性のため)
 *
 * @deprecated createSessionManager / detectAvailableSessionManagers を使用してください
 */
export const SessionManagerFactory = {
	create: createSessionManager,
	detectAvailable: detectAvailableSessionManagers,
};
