/**
 * セッション管理モジュール
 *
 * @module adapters/session
 */

// インターフェース
export type { ISessionManager, Session, SessionManagerType } from "./interface";

// ファクトリー関数
export {
	createSessionManager,
	detectAvailableSessionManagers,
	SessionManagerFactory,
} from "./factory";
export type { SessionManagerOptions } from "./factory";

// 実装
export { NativeSessionManager } from "./native";
export { isTmuxAvailable, TmuxSessionManager } from "./tmux";
