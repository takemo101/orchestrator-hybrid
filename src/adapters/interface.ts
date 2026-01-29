export interface BackendOptions {
	model?: string;
}

export interface IBackendAdapter {
	getCommand(): string;
	getArgs(promptPath: string, options?: BackendOptions): string[];
	getName(): string;
}
