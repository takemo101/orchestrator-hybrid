/**
 * ZellijSessionManager
 *
 * zellijコマンドを介してセッションを操作する実装。
 * 永続性が高く、ターミナルから直接アタッチ可能。
 */

import { SessionError } from "../../core/errors";
import type { ISessionManager, Session, SessionCreateOptions } from "./interface";

/**
 * zellijコマンドを実行するユーティリティ
 */
async function runZellij(
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["zellij", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * ZellijSessionManager
 *
 * zellijを利用したセッション管理。
 * 永続性・対話性が高い。
 */
export class ZellijSessionManager implements ISessionManager {
	private readonly prefix: string;
	private lastCapture: Map<string, string> = new Map();

	constructor(prefix = "orch") {
		this.prefix = prefix;
	}

	/**
	 * セッション名を生成
	 */
	private getSessionName(id: string): string {
		return `${this.prefix}-${id}`;
	}

	/**
	 * セッション名からIDを抽出
	 */
	private extractId(sessionName: string): string | null {
		if (!sessionName.startsWith(`${this.prefix}-`)) {
			return null;
		}
		return sessionName.slice(this.prefix.length + 1);
	}

	async create(
		id: string,
		command: string,
		args: string[],
		options?: SessionCreateOptions,
	): Promise<Session> {
		const sessionName = this.getSessionName(id);

		const existing = await this.isRunning(id);
		if (existing) {
			await this.kill(id);
		}

		const fullCommand = options?.cwd
			? ["sh", "-c", `cd ${JSON.stringify(options.cwd)} && ${command} ${args.join(" ")}`]
			: [command, ...args];

		const result = await runZellij([
			"--session",
			sessionName,
			"action",
			"new-pane",
			"--",
			...fullCommand,
		]);

		if (result.exitCode !== 0 && result.stderr.includes("session")) {
			const proc = Bun.spawn(["zellij", "--session", sessionName, "--", ...fullCommand], {
				stdout: "pipe",
				stderr: "pipe",
				stdin: "pipe",
			});

			// デタッチのため、プロセスを待たない
			// zellijは自動的にデタッチされる
			await new Promise((resolve) => setTimeout(resolve, 500));

			// プロセスが終了していないか確認
			const running = await this.isRunning(id);
			if (!running) {
				const stderr = await new Response(proc.stderr).text();
				throw new SessionError(`Failed to create zellij session: ${stderr}`, {
					sessionId: id,
				});
			}
		} else if (result.exitCode !== 0) {
			throw new SessionError(`Failed to create zellij session: ${result.stderr}`, {
				sessionId: id,
			});
		}

		return {
			id,
			type: "zellij",
			status: "running",
			command,
			args,
			startTime: new Date(),
		};
	}

	async list(): Promise<Session[]> {
		const result = await runZellij(["list-sessions"]);

		// zellijが起動していない場合は空配列
		if (result.exitCode !== 0) {
			return [];
		}

		const sessions: Session[] = [];
		const lines = result.stdout.split("\n").filter((line) => line.trim());

		for (const line of lines) {
			// zellij list-sessions の出力形式: session_name (attached) または session_name
			const match = line.match(/^(\S+)/);
			if (!match) continue;

			const name = match[1];
			const id = this.extractId(name);
			if (!id) continue; // 自分のプレフィックスでないセッションは無視

			sessions.push({
				id,
				type: "zellij",
				status: "running", // zellijに存在 = running
				command: "", // zellijからは取得困難
				args: [],
				startTime: new Date(), // zellijは作成時間を提供しない
			});
		}

		return sessions;
	}

	async getOutput(id: string, lines?: number): Promise<string> {
		const sessionName = this.getSessionName(id);

		// --full: include scrollback buffer (not just visible screen)
		const result = await runZellij(["--session", sessionName, "action", "dump-screen", "--full"]);

		if (result.exitCode !== 0) {
			throw new SessionError(`Failed to dump zellij screen: ${result.stderr}`, {
				sessionId: id,
			});
		}

		let output = result.stdout;

		if (lines !== undefined && lines > 0) {
			const outputLines = output.split("\n");
			output = outputLines.slice(-lines).join("\n");
		}

		return output;
	}

	async *streamOutput(id: string): AsyncIterable<string> {
		const sessionName = this.getSessionName(id);

		while (true) {
			// セッションが存在するか確認
			const running = await this.isRunning(id);
			if (!running) {
				break;
			}

			// dump-screenで現在の出力を取得
			const result = await runZellij(["--session", sessionName, "action", "dump-screen"]);
			if (result.exitCode !== 0) {
				break;
			}

			// 前回との差分を計算
			const lastOutput = this.lastCapture.get(id) ?? "";
			const currentOutput = result.stdout;

			if (currentOutput.length > lastOutput.length) {
				const diff = currentOutput.slice(lastOutput.length);
				this.lastCapture.set(id, currentOutput);
				yield diff;
			}

			// 500ms待機
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		// キャッシュクリア
		this.lastCapture.delete(id);
	}

	async attach(id: string): Promise<void> {
		const sessionName = this.getSessionName(id);

		// セッション存在確認
		const running = await this.isRunning(id);
		if (!running) {
			throw new SessionError(`Session ${id} is not running`, { sessionId: id });
		}

		// zellij attach を inherit で実行
		const proc = Bun.spawn(["zellij", "attach", sessionName], {
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});

		await proc.exited;
	}

	async isRunning(id: string): Promise<boolean> {
		const sessionName = this.getSessionName(id);
		const result = await runZellij(["list-sessions"]);

		if (result.exitCode !== 0) {
			return false;
		}

		// セッション一覧に存在するか確認
		const lines = result.stdout.split("\n");
		return lines.some((line) => line.startsWith(sessionName));
	}

	async kill(id: string): Promise<void> {
		const sessionName = this.getSessionName(id);
		const result = await runZellij(["kill-session", sessionName]);

		if (result.exitCode !== 0) {
			throw new SessionError(`Failed to kill zellij session: ${result.stderr}`, {
				sessionId: id,
			});
		}

		this.lastCapture.delete(id);
	}
}

/**
 * zellijが利用可能かチェック
 */
export async function isZellijAvailable(): Promise<boolean> {
	try {
		const proc = Bun.spawn(["zellij", "--version"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}
