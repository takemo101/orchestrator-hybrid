export interface IBackendAdapter {
	getCommand(): string;
	getArgs(promptPath: string): string[];
	getName(): string;
}
