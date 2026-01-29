/**
 * TmuxSessionManager
 *
 * tmuxコマンドを介してセッションを操作する実装。
 * 永続性が高く、ターミナルから直接アタッチ可能。
 */

import { SessionError } from "../../core/errors";
import type { ISessionManager, Session, SessionCreateOptions } from "./interface";

/**
 * tmuxコマンドを実行するユーティリティ
 */
async function runTmux(
	args: string[],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const proc = Bun.spawn(["tmux", ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;

	return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

/**
 * TmuxSessionManager
 *
 * tmuxを利用したセッション管理。
 * 永続性・対話性が高い。
 */
export class TmuxSessionManager implements ISessionManager {
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
		const fullCommand = [command, ...args].join(" ");

		const sessionExists = await this.sessionExists(id);
		if (sessionExists) {
			await this.kill(id);
		}

		const cdCommand = options?.cwd ? `cd ${JSON.stringify(options.cwd)} && ` : "";
		const wrappedCommand = cdCommand + fullCommand;
		const tmuxCommand = [
			`tmux new-session -d -s ${sessionName} -x 200 -y 50`,
			`tmux set-option -t ${sessionName} remain-on-exit on`,
			`tmux send-keys -t ${sessionName} ${JSON.stringify(wrappedCommand + "; exit")} Enter`,
		].join(" && ");

		const proc = Bun.spawn(["sh", "-c", tmuxCommand], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const stderr = await new Response(proc.stderr).text();
		const exitCode = await proc.exited;

		if (exitCode !== 0) {
			throw new SessionError(`Failed to create tmux session: ${stderr}`, { sessionId: id });
		}

		return {
			id,
			type: "tmux",
			status: "running",
			command,
			args,
			startTime: new Date(),
		};
	}

	async list(): Promise<Session[]> {
		const result = await runTmux(["list-sessions", "-F", "#{session_name}:#{session_created}"]);

		// tmuxが起動していない場合は空配列
		if (result.exitCode !== 0) {
			return [];
		}

		const sessions: Session[] = [];
		const lines = result.stdout.split("\n").filter((line) => line.trim());

		for (const line of lines) {
			const [name, createdTimestamp] = line.split(":");
			const id = this.extractId(name);
			if (!id) continue; // 自分のプレフィックスでないセッションは無視

			const createdDate = createdTimestamp
				? new Date(Number.parseInt(createdTimestamp, 10) * 1000)
				: new Date();

			sessions.push({
				id,
				type: "tmux",
				status: "running", // tmuxに存在 = running
				command: "", // tmuxからは取得困難
				args: [],
				startTime: createdDate,
			});
		}

		return sessions;
	}

	async getOutput(id: string, lines?: number): Promise<string> {
		const sessionName = this.getSessionName(id);

		// -S - -E - : capture entire scrollback buffer (not just visible pane)
		const args = ["capture-pane", "-t", sessionName, "-p", "-S", "-", "-E", "-"];
		if (lines !== undefined) {
			args.splice(4, 4);
			args.push("-S", `-${lines}`);
		}

		const result = await runTmux(args);
		if (result.exitCode !== 0) {
			throw new SessionError(`Failed to capture tmux pane: ${result.stderr}`, { sessionId: id });
		}

		return result.stdout;
	}

	async *streamOutput(id: string): AsyncIterable<string> {
		const sessionName = this.getSessionName(id);

		while (true) {
			// セッションが存在するか確認
			const running = await this.isRunning(id);
			if (!running) {
				break;
			}

			// capture-paneで現在の出力を取得
			const result = await runTmux(["capture-pane", "-t", sessionName, "-p"]);
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

		// tmux attach-session を inherit で実行
		const proc = Bun.spawn(["tmux", "attach-session", "-t", sessionName], {
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});

		await proc.exited;
	}

	async sessionExists(id: string): Promise<boolean> {
		const sessionName = this.getSessionName(id);
		const result = await runTmux(["has-session", "-t", sessionName]);
		return result.exitCode === 0;
	}

	async isRunning(id: string): Promise<boolean> {
		const sessionName = this.getSessionName(id);

		const hasSession = await runTmux(["has-session", "-t", sessionName]);
		if (hasSession.exitCode !== 0) {
			return false;
		}

		// pane_dead=0なら実行中、1なら終了済み（remain-on-exitで残っている）
		const paneStatus = await runTmux(["display-message", "-t", sessionName, "-p", "#{pane_dead}"]);
		return paneStatus.stdout.trim() === "0";
	}

	async kill(id: string): Promise<void> {
		const sessionName = this.getSessionName(id);
		const result = await runTmux(["kill-session", "-t", sessionName]);

		if (result.exitCode !== 0) {
			throw new SessionError(`Failed to kill tmux session: ${result.stderr}`, { sessionId: id });
		}

		this.lastCapture.delete(id);
	}
}

/**
 * tmuxが利用可能かチェック
 */
export async function isTmuxAvailable(): Promise<boolean> {
	try {
		const proc = Bun.spawn(["tmux", "-V"], {
			stdout: "pipe",
			stderr: "pipe",
		});
		const exitCode = await proc.exited;
		return exitCode === 0;
	} catch {
		return false;
	}
}
