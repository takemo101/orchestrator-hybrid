import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { logger } from "./logger.js";

const INITIAL_CONTENT = `# Scratchpad

## Current Status
- [ ] Task not started

## Progress Log

## Decisions Made

## Notes

`;

export function initScratchpad(path: string): void {
	if (existsSync(path)) {
		return;
	}

	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, INITIAL_CONTENT);

	logger.success(`Initialized scratchpad: ${path}`);
}

export function readScratchpad(path: string): string {
	if (!existsSync(path)) {
		return "(empty)";
	}

	return readFileSync(path, "utf-8");
}

export function appendToScratchpad(path: string, content: string): void {
	const existing = existsSync(path) ? readFileSync(path, "utf-8") : "";
	writeFileSync(path, `${existing}\n${content}`);
}
