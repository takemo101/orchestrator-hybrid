/**
 * v3.0.0 エラークラス階層
 *
 * OrchestratorError (基底)
 *   ├── ConfigError     - 設定ファイル関連
 *   ├── GitHubError     - GitHub API関連
 *   └── SessionError    - セッション管理関連
 */

/**
 * オーケストレーター基底エラー
 */
export class OrchestratorError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "OrchestratorError";
	}
}

/**
 * 設定ファイルエラー
 */
export class ConfigError extends OrchestratorError {
	readonly configPath?: string;

	constructor(
		message: string,
		options?: ErrorOptions & { configPath?: string },
	) {
		super(message, options);
		this.name = "ConfigError";
		this.configPath = options?.configPath;
	}
}

/**
 * GitHub APIエラー
 */
export class GitHubError extends OrchestratorError {
	readonly statusCode?: number;

	constructor(
		message: string,
		options?: ErrorOptions & { statusCode?: number },
	) {
		super(message, options);
		this.name = "GitHubError";
		this.statusCode = options?.statusCode;
	}
}

/**
 * セッション管理エラー
 */
export class SessionError extends OrchestratorError {
	readonly sessionId?: string;

	constructor(
		message: string,
		options?: ErrorOptions & { sessionId?: string },
	) {
		super(message, options);
		this.name = "SessionError";
		this.sessionId = options?.sessionId;
	}
}
