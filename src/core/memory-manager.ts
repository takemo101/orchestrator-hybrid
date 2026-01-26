import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";

/**
 * Memoriesの注入モード
 */
export type InjectMode = "auto" | "manual" | "none";

/**
 * Memories設定のzodスキーマ
 */
export const MemoriesConfigSchema = z.object({
	/**
	 * Memoriesを有効にするか
	 */
	enabled: z.boolean().default(true),

	/**
	 * プロンプトへの注入モード
	 * - auto: 自動注入
	 * - manual: エージェントが明示的に読み込む
	 * - none: 注入しない
	 */
	inject: z.enum(["auto", "manual", "none"]).default("auto"),
});

export type MemoriesConfig = z.infer<typeof MemoriesConfigSchema>;

/**
 * Memory
 */
export interface Memory {
	/**
	 * ID（ファイル内の出現順）
	 */
	id: number;

	/**
	 * タイトル（見出し）
	 */
	title: string;

	/**
	 * タグ
	 */
	tags: string[];

	/**
	 * 日付
	 */
	date: string;

	/**
	 * 内容
	 */
	content: string;
}

/**
 * Memory管理クラス
 *
 * セッション間で学習内容を`.agent/memories.md`に永続化します。
 */
export class MemoryManager {
	private readonly config: MemoriesConfig;
	private readonly baseDir: string;
	private readonly memoriesPath: string;

	/**
	 * コンストラクタ
	 * @param config - Memories設定
	 * @param baseDir - .agentディレクトリのパス
	 */
	constructor(config: MemoriesConfig, baseDir: string) {
		this.config = config;
		this.baseDir = baseDir;
		this.memoriesPath = path.join(baseDir, "memories.md");
	}

	/**
	 * Memoriesを読み込み
	 * @returns Memory配列
	 */
	async loadMemories(): Promise<Memory[]> {
		if (!this.config.enabled) {
			return [];
		}

		try {
			const content = await fs.readFile(this.memoriesPath, "utf-8");
			return this.parseMemories(content);
		} catch (error) {
			// ファイルが存在しない場合は空配列
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				return [];
			}
			throw error;
		}
	}

	/**
	 * Markdownからメモリをパース
	 */
	private parseMemories(content: string): Memory[] {
		const memories: Memory[] = [];
		const lines = content.split("\n");
		let currentMemory: Partial<Memory> | null = null;
		let id = 0;

		for (const line of lines) {
			// ## で始まる行が見出し（タイトル）
			if (line.startsWith("## ")) {
				if (currentMemory && currentMemory.title) {
					memories.push(this.finalizeMemory(currentMemory, id++));
				}
				currentMemory = {
					title: line.slice(3).trim(),
					tags: [],
					date: "",
					content: "",
				};
			} else if (currentMemory) {
				// - Tags: でタグを抽出
				if (line.startsWith("- Tags:")) {
					const tagsStr = line.slice(7).trim();
					currentMemory.tags = tagsStr ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean) : [];
				}
				// - Date: で日付を抽出
				else if (line.startsWith("- Date:")) {
					currentMemory.date = line.slice(7).trim();
				}
				// - Content: で内容を抽出
				else if (line.startsWith("- Content:")) {
					currentMemory.content = line.slice(10).trim();
				}
			}
		}

		// 最後のメモリを追加
		if (currentMemory && currentMemory.title) {
			memories.push(this.finalizeMemory(currentMemory, id));
		}

		return memories;
	}

	/**
	 * パーシャルメモリを完全なメモリに変換
	 */
	private finalizeMemory(partial: Partial<Memory>, id: number): Memory {
		return {
			id,
			title: partial.title ?? "",
			tags: partial.tags ?? [],
			date: partial.date ?? "",
			content: partial.content ?? "",
		};
	}

	/**
	 * Memoryを追加
	 * @param content - 学習内容
	 * @param tags - タグ（オプション）
	 */
	async addMemory(content: string, tags: string[] = []): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		const date = new Date().toISOString().split("T")[0];
		const title = this.generateTitle(content);
		const tagsStr = tags.join(", ");

		const memoryEntry = `
## ${title}
- Tags: ${tagsStr}
- Date: ${date}
- Content: ${content}
`;

		try {
			// ファイルが存在するか確認
			await fs.access(this.memoriesPath);
			// 既存ファイルに追記
			await fs.appendFile(this.memoriesPath, memoryEntry);
		} catch {
			// ファイルが存在しない場合は新規作成
			await fs.mkdir(this.baseDir, { recursive: true });
			const header = "# Memories\n";
			await fs.writeFile(this.memoriesPath, header + memoryEntry);
		}
	}

	/**
	 * コンテンツからタイトルを生成
	 */
	private generateTitle(content: string): string {
		// 最初の単語を取得してタイトルにする
		const words = content.split(/\s+/);
		if (words.length >= 2) {
			return `${words[0]} ${words[1]}`.slice(0, 50);
		}
		return content.slice(0, 50);
	}

	/**
	 * Memoryを検索
	 * @param query - 検索クエリ
	 * @returns マッチしたMemory配列
	 */
	async searchMemories(query: string): Promise<Memory[]> {
		if (!this.config.enabled) {
			return [];
		}

		const memories = await this.loadMemories();
		const lowerQuery = query.toLowerCase();

		return memories.filter((memory) => {
			const titleMatch = memory.title.toLowerCase().includes(lowerQuery);
			const contentMatch = memory.content.toLowerCase().includes(lowerQuery);
			const tagsMatch = memory.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));
			return titleMatch || contentMatch || tagsMatch;
		});
	}

	/**
	 * Memoryを削除
	 * @param id - MemoryのID
	 */
	async deleteMemory(id: number): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		const memories = await this.loadMemories();
		const filteredMemories = memories.filter((m) => m.id !== id);

		if (filteredMemories.length === memories.length) {
			// IDが見つからない場合は何もしない
			return;
		}

		// 新しいファイルを再構築
		await this.writeMemories(filteredMemories);
	}

	/**
	 * Memoriesをファイルに書き込み
	 */
	private async writeMemories(memories: Memory[]): Promise<void> {
		let content = "# Memories\n";

		for (const memory of memories) {
			const tagsStr = memory.tags.join(", ");
			content += `
## ${memory.title}
- Tags: ${tagsStr}
- Date: ${memory.date}
- Content: ${memory.content}
`;
		}

		await fs.writeFile(this.memoriesPath, content);
	}

	/**
	 * すべてのMemoriesを取得（一覧表示用）
	 * @returns Memory配列
	 */
	async listMemories(): Promise<Memory[]> {
		return this.loadMemories();
	}

	/**
	 * プロンプト注入用のMarkdownを取得
	 * @returns Markdown文字列（inject: noneの場合は空文字）
	 */
	async getMemoriesMarkdown(): Promise<string> {
		if (!this.config.enabled || this.config.inject === "none") {
			return "";
		}

		try {
			const content = await fs.readFile(this.memoriesPath, "utf-8");
			return content;
		} catch {
			return "";
		}
	}

	/**
	 * Memoriesが有効かどうか
	 */
	isEnabled(): boolean {
		return this.config.enabled;
	}

	/**
	 * 注入モードを取得
	 */
	getInjectMode(): InjectMode {
		return this.config.inject;
	}
}
