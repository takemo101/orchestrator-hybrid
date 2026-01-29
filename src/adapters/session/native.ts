/**
 * NativeSessionManager
 *
 * 外部ツールに依存せず、Bun.spawnを直接利用してプロセスを管理する。
 * CI環境等に適している。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { SessionError } from "../../core/errors";
import type { ISessionManager, Session, SessionCreateOptions } from "./interface";

/**
 * セッションメタデータ (session.json)
 */
interface SessionMetadata {
	id: string;
	command: string;
	args: string[];
	startedAt: string;
	status: "running" | "stopped" | "errored";
	pid: number;
	exitCode: number | null;
}

/**
 * NativeSessionManager
 *
 * Bun.spawn + ファイルログでセッションを管理。
 * 外部ツール不要で、最も互換性が高い。
 */
export class NativeSessionManager implements ISessionManager {
	private readonly baseDir: string;
	private processes: Map<string, { proc: ReturnType<typeof Bun.spawn>; meta: SessionMetadata }> =
		new Map();

	constructor(baseDir = ".agent/sessions") {
		this.baseDir = baseDir;
	}

	/**
	 * セッションディレクトリのパスを取得
	 */
	private getSessionDir(id: string): string {
		return path.join(this.baseDir, id);
	}

	/**
	 * 出力ログファイルのパスを取得
	 */
	private getOutputPath(id: string): string {
		return path.join(this.getSessionDir(id), "output.log");
	}

	/**
	 * メタデータファイルのパスを取得
	 */
	private getMetaPath(id: string): string {
		return path.join(this.getSessionDir(id), "session.json");
	}

	/**
	 * メタデータを保存（ディレクトリが存在する場合のみ）
	 */
	private saveMeta(meta: SessionMetadata): void {
		const metaPath = this.getMetaPath(meta.id);
		const sessionDir = this.getSessionDir(meta.id);

		// ディレクトリが存在しない場合は何もしない（クリーンアップ後など）
		if (!fs.existsSync(sessionDir)) {
			return;
		}

		try {
			fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
		} catch {
			// 書き込み失敗は無視（競合状態でディレクトリが削除された場合など）
		}
	}

	/**
	 * メタデータを読み込み
	 */
	private loadMeta(id: string): SessionMetadata | null {
		const metaPath = this.getMetaPath(id);
		if (!fs.existsSync(metaPath)) {
			return null;
		}
		const content = fs.readFileSync(metaPath, "utf-8");
		return JSON.parse(content) as SessionMetadata;
	}

	async create(
		id: string,
		command: string,
		args: string[],
		options?: SessionCreateOptions,
	): Promise<Session> {
		if (this.processes.has(id)) {
			await this.kill(id);
		}

		const sessionDir = this.getSessionDir(id);
		fs.mkdirSync(sessionDir, { recursive: true });

		const outputPath = this.getOutputPath(id);
		const outputFile = Bun.file(outputPath);
		const outputWriter = outputFile.writer();

		const proc = Bun.spawn([command, ...args], {
			stdout: "pipe",
			stderr: "pipe",
			env: process.env,
			cwd: options?.cwd,
		});

		// メタデータ作成
		const meta: SessionMetadata = {
			id,
			command,
			args,
			startedAt: new Date().toISOString(),
			status: "running",
			pid: proc.pid,
			exitCode: null,
		};
		this.saveMeta(meta);
		this.processes.set(id, { proc, meta });

		// stdout/stderrをログファイルに書き込み
		const writeStream = async (stream: ReadableStream<Uint8Array> | null) => {
			if (!stream) return;
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					outputWriter.write(value);
					outputWriter.flush();
				}
			} catch {
				// ストリーム終了
			}
		};

		// バックグラウンドでストリーム処理
		Promise.all([writeStream(proc.stdout), writeStream(proc.stderr)]).catch(() => {});

		// プロセス終了時の処理
		proc.exited.then((exitCode) => {
			const entry = this.processes.get(id);
			if (entry) {
				entry.meta.status = exitCode === 0 ? "stopped" : "errored";
				entry.meta.exitCode = exitCode;
				this.saveMeta(entry.meta);
			}
			try {
				outputWriter.end();
			} catch {
				// 既にクローズされている場合は無視
			}
		});

		return {
			id,
			type: "native",
			status: "running",
			command,
			args,
			startTime: new Date(meta.startedAt),
		};
	}

	async list(): Promise<Session[]> {
		const sessions: Session[] = [];

		// インメモリのプロセスから取得
		for (const [id, entry] of this.processes) {
			sessions.push({
				id,
				type: "native",
				status: entry.meta.status,
				command: entry.meta.command,
				args: entry.meta.args,
				startTime: new Date(entry.meta.startedAt),
			});
		}

		// ディスクからも読み込み（プロセスが終了している場合）
		if (fs.existsSync(this.baseDir)) {
			const dirs = fs.readdirSync(this.baseDir);
			for (const dir of dirs) {
				if (!this.processes.has(dir)) {
					const meta = this.loadMeta(dir);
					if (meta) {
						sessions.push({
							id: meta.id,
							type: "native",
							status: meta.status,
							command: meta.command,
							args: meta.args,
							startTime: new Date(meta.startedAt),
						});
					}
				}
			}
		}

		return sessions;
	}

	async getOutput(id: string, lines?: number): Promise<string> {
		const outputPath = this.getOutputPath(id);
		if (!fs.existsSync(outputPath)) {
			throw new SessionError(`Session ${id} not found`, { sessionId: id });
		}

		const content = fs.readFileSync(outputPath, "utf-8");
		if (lines === undefined) {
			return content;
		}

		const allLines = content.split("\n");
		return allLines.slice(-lines).join("\n");
	}

	async *streamOutput(id: string): AsyncIterable<string> {
		const outputPath = this.getOutputPath(id);
		if (!fs.existsSync(outputPath)) {
			throw new SessionError(`Session ${id} not found`, { sessionId: id });
		}

		let position = 0;
		const entry = this.processes.get(id);

		while (true) {
			// ファイルが存在するか確認
			if (!fs.existsSync(outputPath)) {
				break;
			}

			// ファイルの新規内容を読み取り
			const stats = fs.statSync(outputPath);
			if (stats.size > position) {
				const fd = fs.openSync(outputPath, "r");
				const buffer = Buffer.alloc(stats.size - position);
				fs.readSync(fd, buffer, 0, buffer.length, position);
				fs.closeSync(fd);
				position = stats.size;
				yield buffer.toString("utf-8");
			}

			// プロセスが終了していたら終了
			if (!entry || entry.meta.status !== "running") {
				break;
			}

			// 500ms待機
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	async attach(_id: string): Promise<void> {
		// Nativeモードでは対話的アタッチは非サポート
		throw new SessionError(
			"Interactive attach is not supported in native mode. Use tmux or zellij.",
			{
				sessionId: _id,
			},
		);
	}

	async isRunning(id: string): Promise<boolean> {
		const entry = this.processes.get(id);
		if (entry) {
			return entry.meta.status === "running";
		}

		// ディスクからメタデータを確認
		const meta = this.loadMeta(id);
		return meta?.status === "running" || false;
	}

	async kill(id: string): Promise<void> {
		const entry = this.processes.get(id);
		if (!entry) {
			throw new SessionError(`Session ${id} not found`, { sessionId: id });
		}

		entry.proc.kill();
		entry.meta.status = "stopped";
		entry.meta.exitCode = -1;
		this.saveMeta(entry.meta);
		this.processes.delete(id);
	}
}
