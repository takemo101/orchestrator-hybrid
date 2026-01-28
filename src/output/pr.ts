import { OrchestratorError } from "../core/errors.js";

/**
 * PR作成エラー
 */
export class PRCreateError extends OrchestratorError {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "PRCreateError";
	}
}

/**
 * PR作成オプション
 */
export interface PRCreateOptions {
	/** ドラフトPRとして作成 */
	draft?: boolean;
	/** PRタイトル（省略時は自動生成） */
	title?: string;
	/** PR本文（省略時は自動生成） */
	body?: string;
	/** ベースブランチ（デフォルト: main） */
	baseBranch?: string;
}

/**
 * PR作成結果
 */
export interface PRCreateResult {
	/** PR URL */
	url: string;
}

/**
 * プロセス実行関数の型（DI用）
 */
export type ExecFn = (
	args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * デフォルトのexec実装（Bun.spawnベース）
 */
async function defaultExec(
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(args, {
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

/**
 * PRタイトルを生成する
 */
function generateTitle(issueNumber: number, issueTitle: string): string {
	return `feat: ${issueTitle} (resolve #${issueNumber})`;
}

/**
 * PR本文を生成する
 */
function generateBody(issueNumber: number): string {
	return [
		"## 概要",
		`Issue #${issueNumber} に基づく自動実装。`,
		"",
		"## 変更内容",
		"- AIエージェントによる自動生成コードの反映",
		"",
		"## 関連Issue",
		`Closes #${issueNumber}`,
	].join("\n");
}

/**
 * PR作成機能
 *
 * ループ完了後にPRを自動作成する。
 * 変更のコミット → プッシュ → gh pr create の順で実行。
 */
export class PRCreator {
	private readonly exec: ExecFn;

	constructor(options?: { exec?: ExecFn }) {
		this.exec = options?.exec ?? defaultExec;
	}

	/**
	 * PRを作成する
	 *
	 * @param issueNumber - Issue番号
	 * @param branchName - ブランチ名
	 * @param issueTitle - Issueタイトル
	 * @param options - PR作成オプション
	 * @returns PR作成結果
	 * @throws {PRCreateError} PR作成失敗時
	 */
	async create(
		issueNumber: number,
		branchName: string,
		issueTitle: string,
		options: PRCreateOptions = {},
	): Promise<PRCreateResult> {
		// 変更の有無を確認
		const hasChanges = await this.hasChanges();
		if (!hasChanges) {
			throw new PRCreateError("No changes to create PR");
		}

		// コミット
		const commitMessage = `feat: ${issueTitle}\n\nCloses #${issueNumber}`;
		await this.commitChanges(commitMessage);

		// プッシュ
		await this.pushBranch(branchName);

		// PR作成
		const title = options.title ?? generateTitle(issueNumber, issueTitle);
		const body = options.body ?? generateBody(issueNumber);
		const baseBranch = options.baseBranch ?? "main";

		const url = await this.createPR(title, body, branchName, baseBranch, options.draft ?? false);

		return { url };
	}

	/**
	 * 変更の有無を確認する
	 */
	private async hasChanges(): Promise<boolean> {
		const result = await this.exec(["git", "status", "--porcelain"]);
		if (result.exitCode !== 0) {
			throw new PRCreateError(`Failed to check git status: ${result.stderr.trim()}`);
		}
		return result.stdout.trim().length > 0;
	}

	/**
	 * 変更をコミットする
	 */
	private async commitChanges(message: string): Promise<void> {
		const addResult = await this.exec(["git", "add", "-A"]);
		if (addResult.exitCode !== 0) {
			throw new PRCreateError(`Failed to stage changes: ${addResult.stderr.trim()}`);
		}

		const commitResult = await this.exec(["git", "commit", "-m", message]);
		if (commitResult.exitCode !== 0) {
			throw new PRCreateError(`Failed to commit changes: ${commitResult.stderr.trim()}`);
		}
	}

	/**
	 * ブランチをプッシュする
	 */
	private async pushBranch(branchName: string): Promise<void> {
		const result = await this.exec(["git", "push", "-u", "origin", branchName]);
		if (result.exitCode !== 0) {
			throw new PRCreateError(`Failed to push branch: ${result.stderr.trim()}`);
		}
	}

	/**
	 * gh pr createを実行する
	 */
	private async createPR(
		title: string,
		body: string,
		head: string,
		base: string,
		draft: boolean,
	): Promise<string> {
		const args = [
			"gh",
			"pr",
			"create",
			"--title",
			title,
			"--body",
			body,
			"--head",
			head,
			"--base",
			base,
		];

		if (draft) {
			args.push("--draft");
		}

		const result = await this.exec(args);
		if (result.exitCode !== 0) {
			throw new PRCreateError(`Failed to create PR: ${result.stderr.trim()}`);
		}

		const url = result.stdout.trim();
		if (url.length === 0) {
			throw new PRCreateError("gh pr create returned empty URL");
		}

		return url;
	}
}
