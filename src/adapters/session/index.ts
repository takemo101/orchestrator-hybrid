/**
 * セッション管理モジュール
 *
 * @module adapters/session
 */

// インターフェース
export type { ISessionManager, Session, SessionManagerType } from "./interface";

// 実装
export { NativeSessionManager } from "./native";
export { TmuxSessionManager, isTmuxAvailable } from "./tmux";

// ファクトリー
export { SessionManagerFactory } from "./factory";
