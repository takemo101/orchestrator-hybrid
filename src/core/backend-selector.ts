import type { Backend } from "../adapters/base.js";
import { ClaudeBackend } from "../adapters/claude.js";
import { GeminiAdapter } from "../adapters/gemini.js";
import { KiroAdapter, type KiroAdapterConfig } from "../adapters/kiro.js";
import type { BackendConfig, Config } from "./types.js";

export interface BackendFactories {
	createGemini: () => Backend;
	createClaude: () => Backend;
	createKiro: (config: KiroAdapterConfig) => Backend;
}

const defaultFactories: BackendFactories = {
	createGemini: () => new GeminiAdapter(),
	createClaude: () => new ClaudeBackend(),
	createKiro: (config: KiroAdapterConfig) => new KiroAdapter(config),
};

export class BackendSelector {
	private readonly factories: BackendFactories;

	constructor(
		private config: Config,
		factories: BackendFactories = defaultFactories,
	) {
		this.factories = factories;
	}

	selectBackend(hatName: string): Backend {
		const hat = this.config.hats?.[hatName];

		// 1. Hat固有の設定を確認
		if (hat?.backend) {
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
					return this.factories.createGemini();
				case "claude":
					return this.factories.createClaude();
				case "kiro":
					throw new Error("Kiro backend requires agent configuration");
				default:
					// 不明な場合はClaudeへフォールバック
					return this.factories.createClaude();
			}
		}

		// objectの場合
		if (typeof config === "object") {
			if ("type" in config && config.type === "kiro") {
				return this.factories.createKiro({ agent: config.agent });
			}
			if ("command" in config) {
				throw new Error("Custom backend not implemented yet");
			}
		}

		// フォールバック
		return this.factories.createClaude();
	}
}
