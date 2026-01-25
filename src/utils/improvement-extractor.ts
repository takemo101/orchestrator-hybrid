/**
 * 改善点抽出ユーティリティ
 *
 * Scratchpadおよびイベント履歴から改善提案を抽出する。
 *
 * @module
 */

import crypto from "node:crypto";
import { logger } from "../core/logger.js";
import { readScratchpad } from "../core/scratchpad.js";
import type { LoopContext } from "../core/types.js";
import type {
	ImprovementCategory,
	ImprovementPriority,
	ImprovementSuggestion,
} from "../output/issue-generator.js";

/**
 * ループコンテキストから改善提案を抽出
 * @param context ループコンテキスト
 * @returns 改善提案配列
 */
export async function extractImprovements(context: LoopContext): Promise<ImprovementSuggestion[]> {
	const suggestions: ImprovementSuggestion[] = [];

	try {
		// 1. Scratchpadから抽出
		const scratchpadSuggestions = extractFromScratchpad(context.scratchpadPath);
		suggestions.push(...scratchpadSuggestions);

		logger.debug(`${suggestions.length}件の改善提案を抽出しました`);
	} catch (error) {
		logger.warn(
			"改善提案の抽出に失敗しました",
			error instanceof Error ? error.message : String(error),
		);
	}

	return suggestions;
}

/**
 * Scratchpadから改善提案を抽出
 * @param scratchpadPath Scratchpadファイルパス
 * @returns 改善提案配列
 */
function extractFromScratchpad(scratchpadPath: string): ImprovementSuggestion[] {
	const content = readScratchpad(scratchpadPath);
	const suggestions: ImprovementSuggestion[] = [];

	// (empty)の場合は空配列を返す
	if (content === "(empty)") {
		return [];
	}

	// 改善提案マーカーのパターン（メタデータはオプショナル）
	const pattern = /<!-- IMPROVEMENT_START\s*(.*?)\s*-->([\s\S]*?)<!-- IMPROVEMENT_END -->/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(content)) !== null) {
		try {
			const metadataStr = match[1] || "";
			const body = match[2].trim();

			const parsedMetadata = parseMetadata(metadataStr);

			const titleMatch = body.match(/\*\*タイトル\*\*:\s*(.+)/);
			const descMatch = body.match(/\*\*説明\*\*:\s*([\s\S]*?)(?=\*\*関連ファイル\*\*|\*\*|$)/);
			const filesMatch = body.match(/\*\*関連ファイル\*\*:\s*([\s\S]*?)(?=\*\*|$)/);

			if (titleMatch && descMatch) {
				const title = titleMatch[1].trim();
				const description = descMatch[1].trim();

				suggestions.push({
					title,
					description,
					priority: parsedMetadata.priority ?? "medium",
					category: parsedMetadata.category,
					relatedFiles: parseRelatedFiles(filesMatch?.[1] ?? ""),
					metadata: {
						id: generateHash(title),
						source: "scratchpad",
						extractedAt: new Date(),
					},
				});
			}
		} catch (error) {
			logger.warn(
				"改善提案のパース中にエラーが発生しました",
				error instanceof Error ? error.message : String(error),
			);
			// 次のマッチへ続行
		}
	}

	return suggestions;
}

/**
 * メタデータ文字列をパース
 * @param metadataStr メタデータ文字列（例: "priority:high category:refactoring"）
 * @returns パースされたメタデータ
 */
function parseMetadata(metadataStr: string): {
	priority?: ImprovementPriority;
	category?: ImprovementCategory;
} {
	const metadata: {
		priority?: ImprovementPriority;
		category?: ImprovementCategory;
	} = {};

	const priorityMatch = metadataStr.match(/priority:(high|medium|low)/);
	if (priorityMatch) {
		metadata.priority = priorityMatch[1] as ImprovementPriority;
	}

	const categoryMatch = metadataStr.match(
		/category:(refactoring|performance|security|documentation|testing)/,
	);
	if (categoryMatch) {
		metadata.category = categoryMatch[1] as ImprovementCategory;
	}

	return metadata;
}

/**
 * 関連ファイル文字列をパース
 * @param filesStr 関連ファイル文字列（例: "- src/file1.ts\n- src/file2.ts"）
 * @returns ファイルパス配列
 */
function parseRelatedFiles(filesStr: string): string[] {
	const lines = filesStr.split("\n").filter(Boolean);
	return lines
		.map((line) => {
			// `src/file.ts` 形式または src/file.ts 形式をサポート
			const match = line.match(/^-\s*`?([^`\n]+)`?$/);
			return match ? match[1].trim() : null;
		})
		.filter((file): file is string => file !== null);
}

/**
 * 文字列からハッシュを生成
 * @param str 入力文字列
 * @returns SHA-256ハッシュ（短縮版）
 */
function generateHash(str: string): string {
	return crypto.createHash("sha256").update(str).digest("hex").slice(0, 8);
}
