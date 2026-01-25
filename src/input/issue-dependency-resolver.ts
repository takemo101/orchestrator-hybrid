import { BunProcessExecutor } from "../core/bun-process-executor.js";
import { CircularDependencyError } from "../core/errors.js";
import { logger } from "../core/logger.js";
import type { ProcessExecutor } from "../core/process-executor.js";

export interface DependencyNode {
	issueNumber: number;
	blockedBy: number[];
	blocking: number[];
	state: "open" | "closed";
}

export class IssueDependencyResolver {
	private readonly executor: ProcessExecutor;

	constructor(executor: ProcessExecutor = new BunProcessExecutor()) {
		this.executor = executor;
	}

	async resolveOrder(issueNumbers: number[]): Promise<number[]> {
		if (issueNumbers.length === 0) {
			return [];
		}

		if (issueNumbers.length === 1) {
			return issueNumbers;
		}

		logger.info(`${issueNumbers.length}件のIssueの依存関係を解析中...`);

		const graph = await this.buildDependencyGraph(issueNumbers);
		this.detectCircularDependency(graph);
		const sorted = this.topologicalSort(graph);

		logger.info(`実行順序: ${sorted.map((n) => `#${n}`).join(" -> ")}`);

		return sorted;
	}

	async getDependencies(issueNumber: number): Promise<DependencyNode> {
		const blockedByResult = await this.executor.spawn("gh", [
			"api",
			`repos/{owner}/{repo}/issues/${issueNumber}/dependencies/blocked_by`,
			"--jq",
			".[].number",
		]);

		const blockingResult = await this.executor.spawn("gh", [
			"api",
			`repos/{owner}/{repo}/issues/${issueNumber}/dependencies/blocking`,
			"--jq",
			".[].number",
		]);

		const blockedBy =
			blockedByResult.exitCode === 0 && blockedByResult.stdout.trim()
				? blockedByResult.stdout
						.trim()
						.split("\n")
						.map(Number)
						.filter((n: number) => !Number.isNaN(n))
				: [];

		const blocking =
			blockingResult.exitCode === 0 && blockingResult.stdout.trim()
				? blockingResult.stdout
						.trim()
						.split("\n")
						.map(Number)
						.filter((n: number) => !Number.isNaN(n))
				: [];

		const issueResult = await this.executor.spawn("gh", [
			"issue",
			"view",
			String(issueNumber),
			"--json",
			"state",
		]);

		let state: "open" | "closed" = "open";
		if (issueResult.exitCode === 0) {
			try {
				const issueData = JSON.parse(issueResult.stdout);
				state = issueData.state?.toLowerCase() === "closed" ? "closed" : "open";
			} catch {
				// JSON parse error - use default
			}
		}

		return {
			issueNumber,
			blockedBy,
			blocking,
			state,
		};
	}

	async checkDependenciesCompleted(issueNumber: number): Promise<boolean> {
		const node = await this.getDependencies(issueNumber);

		if (node.blockedBy.length === 0) {
			return true;
		}

		const incompleteIssues: number[] = [];

		for (const dep of node.blockedBy) {
			const depNode = await this.getDependencies(dep);
			if (depNode.state !== "closed") {
				incompleteIssues.push(dep);
				logger.warn(`Issue #${issueNumber} は Issue #${dep} に依存していますが、未完了です。`);
			}
		}

		if (incompleteIssues.length > 0) {
			logger.error(`未完了の依存Issue: ${incompleteIssues.map((n) => `#${n}`).join(", ")}`);
			return false;
		}

		return true;
	}

	async generateDependencyReport(issueNumber: number): Promise<string> {
		const node = await this.getDependencies(issueNumber);
		const lines: string[] = [];

		lines.push(`Issue #${issueNumber} の依存関係:`);
		lines.push("");

		lines.push("  依存元（blockedBy）:");
		if (node.blockedBy.length === 0) {
			lines.push("    なし");
		} else {
			for (const dep of node.blockedBy) {
				const depNode = await this.getDependencies(dep);
				const status = depNode.state === "closed" ? "[closed]" : "[open] <- 未完了";
				lines.push(`    - #${dep}: ${status}`);
			}
		}
		lines.push("");

		lines.push("  ブロック先（blocking）:");
		if (node.blocking.length === 0) {
			lines.push("    なし");
		} else {
			for (const dep of node.blocking) {
				lines.push(`    - #${dep}`);
			}
		}
		lines.push("");

		const completed = await this.checkDependenciesCompleted(issueNumber);
		const status = completed ? "すべての依存Issueが完了" : "依存Issue未完了";
		lines.push(`ステータス: ${status}`);

		return lines.join("\n");
	}

	private async buildDependencyGraph(issueNumbers: number[]): Promise<Map<number, DependencyNode>> {
		const graph = new Map<number, DependencyNode>();

		for (const issueNumber of issueNumbers) {
			const node = await this.getDependencies(issueNumber);
			graph.set(issueNumber, node);
		}

		return graph;
	}

	private detectCircularDependency(graph: Map<number, DependencyNode>): void {
		const visited = new Set<number>();
		const recursionStack = new Set<number>();
		const path: number[] = [];

		const dfs = (issueNumber: number): void => {
			visited.add(issueNumber);
			recursionStack.add(issueNumber);
			path.push(issueNumber);

			const node = graph.get(issueNumber);
			if (!node) {
				recursionStack.delete(issueNumber);
				path.pop();
				return;
			}

			for (const dep of node.blockedBy) {
				if (!graph.has(dep)) {
					continue;
				}

				if (!visited.has(dep)) {
					dfs(dep);
				} else if (recursionStack.has(dep)) {
					const cycleStartIndex = path.indexOf(dep);
					const cycle = [...path.slice(cycleStartIndex), dep];

					throw new CircularDependencyError(
						`循環依存を検出: ${cycle.map((n) => `#${n}`).join(" -> ")}`,
						{ cycle },
					);
				}
			}

			recursionStack.delete(issueNumber);
			path.pop();
		};

		for (const issueNumber of graph.keys()) {
			if (!visited.has(issueNumber)) {
				dfs(issueNumber);
			}
		}
	}

	private topologicalSort(graph: Map<number, DependencyNode>): number[] {
		const inDegree = this.calculateInDegree(graph);
		const queue = this.getZeroInDegreeNodes(inDegree);
		return this.processTopologicalQueue(graph, inDegree, queue);
	}

	private calculateInDegree(graph: Map<number, DependencyNode>): Map<number, number> {
		const inDegree = new Map<number, number>();

		for (const issueNumber of graph.keys()) {
			inDegree.set(issueNumber, 0);
		}

		for (const node of graph.values()) {
			for (const dep of node.blockedBy) {
				if (graph.has(dep)) {
					const current = inDegree.get(node.issueNumber) ?? 0;
					inDegree.set(node.issueNumber, current + 1);
				}
			}
		}

		return inDegree;
	}

	private getZeroInDegreeNodes(inDegree: Map<number, number>): number[] {
		const queue: number[] = [];
		for (const [issueNumber, degree] of inDegree.entries()) {
			if (degree === 0) {
				queue.push(issueNumber);
			}
		}
		return queue;
	}

	private processTopologicalQueue(
		graph: Map<number, DependencyNode>,
		inDegree: Map<number, number>,
		queue: number[],
	): number[] {
		const result: number[] = [];

		while (queue.length > 0) {
			queue.sort((a, b) => a - b);
			const issueNumber = queue.shift();
			if (issueNumber === undefined) {
				break;
			}
			result.push(issueNumber);

			const node = graph.get(issueNumber);
			if (!node) {
				continue;
			}

			this.decrementBlockedInDegree(graph, inDegree, queue, node.blocking);
		}

		return result;
	}

	private decrementBlockedInDegree(
		graph: Map<number, DependencyNode>,
		inDegree: Map<number, number>,
		queue: number[],
		blocking: number[],
	): void {
		for (const blocked of blocking) {
			if (!graph.has(blocked)) {
				continue;
			}

			const currentDegree = inDegree.get(blocked) ?? 0;
			const degree = currentDegree - 1;
			inDegree.set(blocked, degree);

			if (degree === 0) {
				queue.push(blocked);
			}
		}
	}
}
