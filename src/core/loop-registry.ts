import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { z } from "zod";
import { type Loop, LoopSchema, type LoopState } from "./types.js";

const LoopsFileSchema = z.object({
	loops: z.array(LoopSchema),
});

export class LoopRegistry {
	private baseDir: string;
	private loopsFile: string;

	constructor(baseDir: string = ".orch") {
		this.baseDir = baseDir;
		this.loopsFile = join(this.baseDir, "loops.json");
	}

	private async loadLoops(): Promise<Loop[]> {
		if (!existsSync(this.loopsFile)) {
			return [];
		}
		try {
			const content = await readFile(this.loopsFile, "utf-8");
			const json = JSON.parse(content);
			const result = LoopsFileSchema.parse(json);
			return result.loops;
		} catch (error) {
			return [];
		}
	}

	private async saveLoops(loops: Loop[]): Promise<void> {
		if (!existsSync(this.baseDir)) {
			await mkdir(this.baseDir, { recursive: true });
		}
		const data = { loops };
		await writeFile(this.loopsFile, JSON.stringify(data, null, 2));
	}

	async registerLoop(loop: Loop): Promise<void> {
		const loops = await this.loadLoops();
		if (loops.some((l) => l.id === loop.id)) {
			throw new Error(`Loop with ID ${loop.id} already exists`);
		}
		loops.push(loop);
		await this.saveLoops(loops);
	}

	async updateLoopState(loopId: string, state: LoopState): Promise<void> {
		const loops = await this.loadLoops();
		const index = loops.findIndex((l) => l.id === loopId);
		if (index === -1) {
			throw new Error(`Loop with ID ${loopId} not found`);
		}
		loops[index].state = state;
		loops[index].updated_at = new Date().toISOString();
		await this.saveLoops(loops);
	}

	async listLoops(): Promise<Loop[]> {
		return this.loadLoops();
	}

	async deleteLoop(loopId: string): Promise<void> {
		let loops = await this.loadLoops();
		const initialLength = loops.length;
		loops = loops.filter((l) => l.id !== loopId);
		if (loops.length !== initialLength) {
			await this.saveLoops(loops);
		}
	}
}
