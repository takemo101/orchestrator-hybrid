/**
 * セッション管理モジュール
 *
 * @module adapters/session
 */

// ファクトリー
export { SessionManagerFactory } from "./factory";
// インターフェース
export type { ISessionManager, Session, SessionManagerType } from "./interface";
// 実装
export { NativeSessionManager } from "./native";
export { isTmuxAvailable, TmuxSessionManager } from "./tmux";
