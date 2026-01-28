import { z } from "zod";
import { GitHubError } from "../core/errors";
import { type IssueInfo, IssueInfoSchema } from "../core/types";

/**
 * gh CLIの出力をパースするためのスキーマ。
 * gh issue view --json title,body,labels が返すラベル構造は
 * { name, color, description } だが、IssueInfoSchema の labels は string[] のため変換が必要。
 */
const GhIssueLabelSchema = z.object({
	name: z.string(),
});

const GhIssueResponseSchema = z.object({
	title: z.string(),
	body: z.string(),
	labels: z.array(GhIssueLabelSchema),
});

/**
 * プロセス実行関数の型。
 * テスト時にBun.spawnをモックするための依存性注入ポイント。
 */
export type ExecFn = (
	args: string[],
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * fetchIssueのオプション
 */
export interface FetchIssueOptions {
	/** プロセス実行関数（DI用。デフォルト: defaultExec） */
	exec?: ExecFn;
	/** リポジトリ指定（owner/repo形式） */
	repository?: string;
}

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
 * GitHub Issueの情報を取得する。
 *
 * gh issue view <number> --json title,body,labels を実行し、
 * 結果をIssueInfo型に変換して返す。
 *
 * @param issueNumber - 取得するIssue番号
 * @param options - 実行オプション
 * @returns Issue情報
 * @throws GitHubError ghコマンド実行失敗・パースエラー時
 */
export async function fetchIssue(
	issueNumber: number,
	options: FetchIssueOptions = {},
): Promise<IssueInfo> {
	const exec = options.exec ?? defaultExec;

	const args = [
		"gh",
		"issue",
		"view",
		String(issueNumber),
		"--json",
		"title,body,labels",
	];
	if (options.repository) {
		args.push("--repo", options.repository);
	}

	let result: { stdout: string; stderr: string; exitCode: number };
	try {
		result = await exec(args);
	} catch (error) {
		throw new GitHubError(
			`Failed to execute gh command for Issue #${issueNumber}`,
			{ cause: error },
		);
	}

	if (result.exitCode !== 0) {
		throw new GitHubError(
			`Failed to fetch Issue #${issueNumber}: ${result.stderr.trim() || "unknown error"}`,
		);
	}

	let parsed: z.infer<typeof GhIssueResponseSchema>;
	try {
		const json: unknown = JSON.parse(result.stdout);
		parsed = GhIssueResponseSchema.parse(json);
	} catch (error) {
		throw new GitHubError(
			`Failed to parse response for Issue #${issueNumber}`,
			{ cause: error },
		);
	}

	return IssueInfoSchema.parse({
		number: issueNumber,
		title: parsed.title,
		body: parsed.body,
		labels: parsed.labels.map((l) => l.name),
	});
}
