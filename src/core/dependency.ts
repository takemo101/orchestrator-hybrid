import { OrchestratorError } from "./errors";
import type { IssueInfo } from "./types";

/**
 * 循環依存エラー
 */
export class CircularDependencyError extends OrchestratorError {
	readonly cycle: number[];

	constructor(cycle: number[]) {
		super(`Circular dependency detected: ${cycle.map((n) => `#${n}`).join(" -> ")}`);
		this.name = "CircularDependencyError";
		this.cycle = cycle;
	}
}

/**
 * 依存Issueが見つからないエラー
 */
export class DependencyNotFoundError extends OrchestratorError {
	readonly issueNumber: number;

	constructor(issueNumber: number) {
		super(`Dependency issue #${issueNumber} not found`);
		this.name = "DependencyNotFoundError";
		this.issueNumber = issueNumber;
	}
}

/**
 * 依存グラフのノード
 */
export interface DependencyNode {
	issueNumber: number;
	dependencies: number[];
	state: "open" | "closed";
}

/**
 * Issue情報取得関数の型
 */
export type FetchIssueFn = (issueNumber: number) => Promise<IssueInfo>;

/**
 * DependencyResolverのオプション
 */
export interface DependencyResolverOptions {
	fetchIssue: FetchIssueFn;
}

/**
 * Issue本文から依存関係を抽出する
 *
 * 対象キーワード:
 * - Blocked by #XX
 * - Depends on #XX, #YY
 * - Needs #XX
 * - 前提Issue: #XX
 *
 * @param body Issue本文
 * @returns 依存Issue番号の配列（重複排除済み）
 */
export function parseDependencies(body: string): number[] {
	// まずキーワードに続く部分を抽出
	const keywordRegex = /(?:Blocked by|Depends on|Needs|前提Issue)[:\s]*([^\n]+)/gi;
	const ids = new Set<number>();

	const keywordMatches = body.matchAll(keywordRegex);
	for (const keywordMatch of keywordMatches) {
		// その部分から#数字を全て抽出
		const issueRegex = /#(\d+)/g;
		const issueMatches = keywordMatch[1].matchAll(issueRegex);
		for (const issueMatch of issueMatches) {
			ids.add(Number.parseInt(issueMatch[1], 10));
		}
	}

	return Array.from(ids);
}

/**
 * Issue間の依存関係を解析し、実行順序を決定するリゾルバー
 *
 * - Issue本文から依存関係を抽出
 * - トポロジカルソートで実行順序を決定
 * - 循環依存を検出してエラーを報告
 */
export class DependencyResolver {
	private fetchIssue: FetchIssueFn;

	constructor(options: DependencyResolverOptions) {
		this.fetchIssue = options.fetchIssue;
	}

	/**
	 * 指定されたIssueの依存関係を解決し、実行順序を返す
	 *
	 * @param rootIssueId 起点となるIssue番号
	 * @returns トポロジカルソートされたIssue番号の配列
	 * @throws CircularDependencyError 循環依存が検出された場合
	 */
	async resolveOrder(rootIssueId: number): Promise<number[]> {
		const graph = await this.buildGraph(rootIssueId);

		// 完了済みIssueを除外
		for (const [id, node] of graph) {
			if (node.state === "closed") {
				graph.delete(id);
			}
		}

		// トポロジカルソート
		return this.topologicalSort(graph, rootIssueId);
	}

	/**
	 * 依存グラフを構築する
	 *
	 * @param rootId 起点となるIssue番号
	 * @returns 依存グラフ（Map<Issue番号, ノード>）
	 */
	async buildGraph(rootId: number): Promise<Map<number, DependencyNode>> {
		const graph = new Map<number, DependencyNode>();
		const visited = new Set<number>();

		await this.buildGraphRecursive(rootId, graph, visited);

		return graph;
	}

	/**
	 * 再帰的に依存グラフを構築する
	 */
	private async buildGraphRecursive(
		issueId: number,
		graph: Map<number, DependencyNode>,
		visited: Set<number>,
	): Promise<void> {
		if (visited.has(issueId)) {
			return;
		}
		visited.add(issueId);

		let issue: IssueInfo;
		try {
			issue = await this.fetchIssue(issueId);
		} catch {
			// 存在しないIssueは警告してスキップ
			console.warn(`Warning: Dependency issue #${issueId} not found. Skipping.`);
			return;
		}

		const dependencies = parseDependencies(issue.body);
		const isCompleted = issue.labels.includes("orch:completed");

		graph.set(issueId, {
			issueNumber: issueId,
			dependencies,
			state: isCompleted ? "closed" : "open",
		});

		// 依存先を再帰的に取得
		for (const depId of dependencies) {
			await this.buildGraphRecursive(depId, graph, visited);
		}
	}

	/**
	 * トポロジカルソートを実行
	 *
	 * Kahnのアルゴリズムを使用
	 */
	private topologicalSort(graph: Map<number, DependencyNode>, rootId: number): number[] {
		// グラフにルートのみの場合
		if (!graph.has(rootId)) {
			return [rootId];
		}

		// 入次数を計算
		const inDegree = new Map<number, number>();
		for (const id of graph.keys()) {
			inDegree.set(id, 0);
		}

		for (const node of graph.values()) {
			for (const dep of node.dependencies) {
				if (graph.has(dep)) {
					inDegree.set(node.issueNumber, (inDegree.get(node.issueNumber) ?? 0) + 1);
				}
			}
		}

		// 入次数0のノードをキューに追加
		const queue: number[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) {
				queue.push(id);
			}
		}

		const result: number[] = [];
		const visited = new Set<number>();

		while (queue.length > 0) {
			const current = queue.shift()!;
			if (visited.has(current)) {
				continue;
			}
			visited.add(current);
			result.push(current);

			// 依存元の入次数を減らす
			for (const [id, node] of graph) {
				if (node.dependencies.includes(current)) {
					const newDegree = (inDegree.get(id) ?? 0) - 1;
					inDegree.set(id, newDegree);
					if (newDegree === 0 && !visited.has(id)) {
						queue.push(id);
					}
				}
			}
		}

		// 循環依存チェック
		if (result.length !== graph.size) {
			// 循環依存のパスを検出
			const cycle = this.findCycle(graph);
			throw new CircularDependencyError(cycle);
		}

		return result;
	}

	/**
	 * 循環依存のパスを検出する
	 */
	private findCycle(graph: Map<number, DependencyNode>): number[] {
		const visited = new Set<number>();
		const recStack = new Set<number>();
		const path: number[] = [];

		const dfs = (id: number): boolean => {
			visited.add(id);
			recStack.add(id);
			path.push(id);

			const node = graph.get(id);
			if (node) {
				for (const dep of node.dependencies) {
					if (graph.has(dep)) {
						if (!visited.has(dep)) {
							if (dfs(dep)) return true;
						} else if (recStack.has(dep)) {
							path.push(dep);
							return true;
						}
					}
				}
			}

			recStack.delete(id);
			path.pop();
			return false;
		};

		for (const id of graph.keys()) {
			if (!visited.has(id)) {
				if (dfs(id)) {
					// サイクルの開始点を見つける
					const cycleStart = path[path.length - 1];
					const cycleStartIdx = path.indexOf(cycleStart);
					return path.slice(cycleStartIdx);
				}
			}
		}

		return [];
	}
}
