import type { BackendResult } from "../core/types.js";

export interface Backend {
	readonly name: string;
	execute(prompt: string): Promise<BackendResult>;
}

export abstract class BaseBackend implements Backend {
	abstract readonly name: string;
	abstract execute(prompt: string): Promise<BackendResult>;
}
