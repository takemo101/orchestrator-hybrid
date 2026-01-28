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
	const keywordRegex = /(?:Blocked by|Depends on|Needs|前提Issue)[:\s]*([^\n]+)/gi;
	const ids = new Set<number>();

	const keywordMatches = body.matchAll(keywordRegex);
	for (const keywordMatch of keywordMatches) {
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
 */
export class DependencyResolver {
	private fetchIssue: FetchIssueFn;

	constructor(options: DependencyResolverOptions) {
		this.fetchIssue = options.fetchIssue;
	}

	/**
	 * 指定されたIssueの依存関係を解決し、実行順序を返す
	 */
	async resolveOrder(rootIssueId: number): Promise<number[]> {
		const graph = await this.buildGraph(rootIssueId);
		this.removeCompletedIssues(graph);
		return this.topologicalSort(graph, rootIssueId);
	}

	/**
	 * 依存グラフを構築する
	 */
	async buildGraph(rootId: number): Promise<Map<number, DependencyNode>> {
		const graph = new Map<number, DependencyNode>();
		const visited = new Set<number>();
		await this.buildGraphRecursive(rootId, graph, visited);
		return graph;
	}

	private removeCompletedIssues(graph: Map<number, DependencyNode>): void {
		for (const [id, node] of graph) {
			if (node.state === "closed") {
				graph.delete(id);
			}
		}
	}

	private async buildGraphRecursive(
		issueId: number,
		graph: Map<number, DependencyNode>,
		visited: Set<number>,
	): Promise<void> {
		if (visited.has(issueId)) return;
		visited.add(issueId);

		const issue = await this.fetchIssueOrWarn(issueId);
		if (!issue) return;

		const dependencies = parseDependencies(issue.body);
		const isCompleted = issue.labels.includes("orch:completed");

		graph.set(issueId, {
			issueNumber: issueId,
			dependencies,
			state: isCompleted ? "closed" : "open",
		});

		for (const depId of dependencies) {
			await this.buildGraphRecursive(depId, graph, visited);
		}
	}

	private async fetchIssueOrWarn(issueId: number): Promise<IssueInfo | null> {
		try {
			return await this.fetchIssue(issueId);
		} catch {
			console.warn(`Warning: Dependency issue #${issueId} not found. Skipping.`);
			return null;
		}
	}

	private topologicalSort(graph: Map<number, DependencyNode>, rootId: number): number[] {
		if (!graph.has(rootId)) return [rootId];

		const inDegree = this.calculateInDegrees(graph);
		const result = this.processQueue(graph, inDegree);

		if (result.length !== graph.size) {
			throw new CircularDependencyError(this.findCycle(graph));
		}

		return result;
	}

	private calculateInDegrees(graph: Map<number, DependencyNode>): Map<number, number> {
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
		return inDegree;
	}

	private processQueue(
		graph: Map<number, DependencyNode>,
		inDegree: Map<number, number>,
	): number[] {
		const queue = this.initializeQueue(inDegree);
		const result: number[] = [];
		const visited = new Set<number>();

		while (queue.length > 0) {
			const current = queue.shift() as number;
			if (visited.has(current)) continue;

			visited.add(current);
			result.push(current);
			this.decrementDependents(graph, inDegree, current, queue, visited);
		}

		return result;
	}

	private initializeQueue(inDegree: Map<number, number>): number[] {
		const queue: number[] = [];
		for (const [id, degree] of inDegree) {
			if (degree === 0) queue.push(id);
		}
		return queue;
	}

	private decrementDependents(
		graph: Map<number, DependencyNode>,
		inDegree: Map<number, number>,
		current: number,
		queue: number[],
		visited: Set<number>,
	): void {
		for (const [id, node] of graph) {
			if (!node.dependencies.includes(current)) continue;

			const newDegree = (inDegree.get(id) ?? 0) - 1;
			inDegree.set(id, newDegree);
			if (newDegree === 0 && !visited.has(id)) {
				queue.push(id);
			}
		}
	}

	private findCycle(graph: Map<number, DependencyNode>): number[] {
		const visited = new Set<number>();
		const recStack = new Set<number>();
		const path: number[] = [];

		for (const id of graph.keys()) {
			if (visited.has(id)) continue;
			const cycle = this.dfsForCycle(graph, id, visited, recStack, path);
			if (cycle.length > 0) return cycle;
		}

		return [];
	}

	private dfsForCycle(
		graph: Map<number, DependencyNode>,
		id: number,
		visited: Set<number>,
		recStack: Set<number>,
		path: number[],
	): number[] {
		visited.add(id);
		recStack.add(id);
		path.push(id);

		const node = graph.get(id);
		if (node) {
			for (const dep of node.dependencies) {
				if (!graph.has(dep)) continue;

				if (!visited.has(dep)) {
					const cycle = this.dfsForCycle(graph, dep, visited, recStack, path);
					if (cycle.length > 0) return cycle;
				} else if (recStack.has(dep)) {
					path.push(dep);
					const cycleStartIdx = path.indexOf(dep);
					return path.slice(cycleStartIdx);
				}
			}
		}

		recStack.delete(id);
		path.pop();
		return [];
	}
}
