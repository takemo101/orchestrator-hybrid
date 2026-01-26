import type { Backend } from "../adapters/base.js";
import { ClaudeBackend } from "../adapters/claude.js";
import { GeminiAdapter } from "../adapters/gemini.js";
import { KiroAdapter } from "../adapters/kiro.js";
import type { BackendConfig, Config } from "./types.js";

export class BackendSelector {
	constructor(private config: Config) {}

	selectBackend(hatName: string): Backend {
		const hat = this.config.hats?.[hatName];

		// 1. Hat固有の設定を確認
		if (hat && hat.backend) {
			return this.createBackend(hat.backend);
		}

		// 2. グローバル設定を使用 (backend.type)
		const globalType = this.config.backend.type;
		return this.createBackend(globalType);
	}

	private createBackend(config: BackendConfig | string): Backend {
		// stringの場合
		if (typeof config === "string") {
			switch (config) {
				case "gemini":
					return new GeminiAdapter();
				case "claude":
					return new ClaudeBackend();
				case "kiro":
					throw new Error("Kiro backend requires agent configuration");
				default:
					// 不明な場合はClaudeへフォールバック
					return new ClaudeBackend();
			}
		}

		// objectの場合
		if (typeof config === "object") {
			if ("type" in config && config.type === "kiro") {
				return new KiroAdapter({ agent: config.agent });
			}
			if ("command" in config) {
				throw new Error("Custom backend not implemented yet");
			}
		}

		// フォールバック
		return new ClaudeBackend();
	}
}
