/**
 * F-012: セッション管理機能
 *
 * バックエンド実行をセッションとして管理する抽象化レイヤー。
 * native / tmux / zellij の実装を統一インターフェースで提供。
 */

/**
 * セッション情報
 */
export interface Session {
	/** セッションID (例: orch-123) */
	id: string;
	/** 実装タイプ */
	type: "native" | "tmux" | "zellij";
	/** 現在の状態 */
	status: "running" | "stopped" | "errored";
	/** 実行コマンド */
	command: string;
	/** コマンド引数 */
	args: string[];
	/** 開始日時 */
	startTime: Date;
}

/**
 * セッションマネージャーインターフェース
 *
 * すべてのセッション実装が遵守すべきインターフェース。
 */
export interface ISessionManager {
	/**
	 * 新しいセッションを作成し、コマンドを実行する
	 */
	create(id: string, command: string, args: string[]): Promise<Session>;

	/**
	 * 現在管理下のセッション一覧を取得する
	 */
	list(): Promise<Session[]>;

	/**
	 * 指定したセッションの出力を取得する
	 * @param id セッションID
	 * @param lines 取得する末尾の行数
	 */
	getOutput(id: string, lines?: number): Promise<string>;

	/**
	 * 指定したセッションの出力をリアルタイムにストリーミングする
	 * @param id セッションID
	 */
	streamOutput(id: string): AsyncIterable<string>;

	/**
	 * 指定したセッションに対話的にアタッチする（CLI用）
	 * @param id セッションID
	 */
	attach(id: string): Promise<void>;

	/**
	 * セッションが実行中かどうかを確認する
	 * @param id セッションID
	 */
	isRunning(id: string): Promise<boolean>;

	/**
	 * セッションを強制終了する
	 * @param id セッションID
	 */
	kill(id: string): Promise<void>;
}

/**
 * セッションマネージャー種別
 */
export type SessionManagerType = "auto" | "native" | "tmux" | "zellij";
