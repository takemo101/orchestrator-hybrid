import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { type MemoriesConfig, MemoryManager } from "./memory-manager.js";

describe("MemoryManager", () => {
	const testBaseDir = ".agent-test";
	const memoriesPath = path.join(testBaseDir, "memories.md");

	const defaultConfig: MemoriesConfig = {
		enabled: true,
		inject: "auto",
	};

	beforeEach(async () => {
		await fs.mkdir(testBaseDir, { recursive: true });
	});

	afterEach(async () => {
		try {
			await fs.rm(testBaseDir, { recursive: true, force: true });
		} catch {
			// ignore
		}
	});

	describe("constructor", () => {
		test("creates instance with config", () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			expect(manager).toBeInstanceOf(MemoryManager);
		});

		test("creates instance with disabled config", () => {
			const config: MemoriesConfig = { enabled: false, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			expect(manager).toBeInstanceOf(MemoryManager);
		});
	});

	describe("loadMemories", () => {
		test("returns empty array when file does not exist", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const memories = await manager.loadMemories();
			expect(memories).toEqual([]);
		});

		test("parses memories from markdown file", async () => {
			const content = `# Memories

## Pattern: Error Handling
- Tags: pattern, error-handling
- Date: 2026-01-26
- Content: Always use try-catch blocks for async operations

## Solution: CI Timeout
- Tags: solution, ci
- Date: 2026-01-25
- Content: Increase CI timeout to 600 seconds
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const memories = await manager.loadMemories();

			expect(memories).toHaveLength(2);
			expect(memories[0].title).toBe("Pattern: Error Handling");
			expect(memories[0].tags).toEqual(["pattern", "error-handling"]);
			expect(memories[0].date).toBe("2026-01-26");
			expect(memories[0].content).toBe("Always use try-catch blocks for async operations");

			expect(memories[1].title).toBe("Solution: CI Timeout");
			expect(memories[1].tags).toEqual(["solution", "ci"]);
		});

		test("returns empty array when memories disabled", async () => {
			const content = `# Memories

## Test Memory
- Tags: test
- Date: 2026-01-26
- Content: This should not be loaded
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const config: MemoriesConfig = { enabled: false, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			const memories = await manager.loadMemories();

			expect(memories).toEqual([]);
		});
	});

	describe("addMemory", () => {
		test("adds memory to empty file", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			await manager.addMemory("Test content", ["test", "example"]);

			const memories = await manager.loadMemories();
			expect(memories).toHaveLength(1);
			expect(memories[0].content).toBe("Test content");
			expect(memories[0].tags).toEqual(["test", "example"]);
		});

		test("appends memory to existing file", async () => {
			const content = `# Memories

## Existing Memory
- Tags: existing
- Date: 2026-01-25
- Content: Existing content
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const manager = new MemoryManager(defaultConfig, testBaseDir);
			await manager.addMemory("New content", ["new"]);

			const memories = await manager.loadMemories();
			expect(memories).toHaveLength(2);
			expect(memories[1].content).toBe("New content");
		});

		test("does nothing when memories disabled", async () => {
			const config: MemoriesConfig = { enabled: false, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			await manager.addMemory("Should not be added", ["test"]);

			const exists = await fs
				.access(memoriesPath)
				.then(() => true)
				.catch(() => false);
			expect(exists).toBe(false);
		});

		test("uses current date when adding memory", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			await manager.addMemory("Test", []);

			const memories = await manager.loadMemories();
			const today = new Date().toISOString().split("T")[0];
			expect(memories[0].date).toBe(today);
		});
	});

	describe("searchMemories", () => {
		beforeEach(async () => {
			const content = `# Memories

## Pattern: Error Handling
- Tags: pattern, error
- Date: 2026-01-26
- Content: Always use try-catch blocks

## Solution: Database Connection
- Tags: solution, database
- Date: 2026-01-25
- Content: Use connection pooling

## Architecture: API Design
- Tags: architecture, api
- Date: 2026-01-24
- Content: Use REST for public APIs
`;
			await fs.writeFile(memoriesPath, content, "utf-8");
		});

		test("searches by title", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const results = await manager.searchMemories("Error");

			expect(results).toHaveLength(1);
			expect(results[0].title).toBe("Pattern: Error Handling");
		});

		test("searches by content", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const results = await manager.searchMemories("pooling");

			expect(results).toHaveLength(1);
			expect(results[0].title).toBe("Solution: Database Connection");
		});

		test("searches by tags", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const results = await manager.searchMemories("architecture");

			expect(results).toHaveLength(1);
			expect(results[0].title).toBe("Architecture: API Design");
		});

		test("returns empty array when no matches", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const results = await manager.searchMemories("nonexistent");

			expect(results).toEqual([]);
		});

		test("returns empty array when disabled", async () => {
			const config: MemoriesConfig = { enabled: false, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			const results = await manager.searchMemories("Error");

			expect(results).toEqual([]);
		});

		test("case-insensitive search", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const results = await manager.searchMemories("error");

			expect(results).toHaveLength(1);
		});
	});

	describe("deleteMemory", () => {
		beforeEach(async () => {
			const content = `# Memories

## First Memory
- Tags: first
- Date: 2026-01-26
- Content: First content

## Second Memory
- Tags: second
- Date: 2026-01-25
- Content: Second content
`;
			await fs.writeFile(memoriesPath, content, "utf-8");
		});

		test("deletes memory by id", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			let memories = await manager.loadMemories();
			expect(memories).toHaveLength(2);

			await manager.deleteMemory(memories[0].id);

			memories = await manager.loadMemories();
			expect(memories).toHaveLength(1);
			expect(memories[0].title).toBe("Second Memory");
		});

		test("does nothing when id not found", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			await manager.deleteMemory(9999);

			const memories = await manager.loadMemories();
			expect(memories).toHaveLength(2);
		});

		test("does nothing when disabled", async () => {
			const config: MemoriesConfig = { enabled: false, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			await manager.deleteMemory(0);

			const raw = await fs.readFile(memoriesPath, "utf-8");
			expect(raw).toContain("First Memory");
			expect(raw).toContain("Second Memory");
		});
	});

	describe("listMemories", () => {
		test("returns all memories", async () => {
			const content = `# Memories

## Memory One
- Tags: one
- Date: 2026-01-26
- Content: Content one

## Memory Two
- Tags: two
- Date: 2026-01-25
- Content: Content two
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const memories = await manager.listMemories();

			expect(memories).toHaveLength(2);
		});

		test("returns empty array when no memories", async () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const memories = await manager.listMemories();

			expect(memories).toEqual([]);
		});
	});

	describe("getMemoriesMarkdown", () => {
		test("returns formatted markdown for injection", async () => {
			const content = `# Memories

## Pattern: Error Handling
- Tags: pattern
- Date: 2026-01-26
- Content: Use try-catch
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const markdown = await manager.getMemoriesMarkdown();

			expect(markdown).toContain("# Memories");
			expect(markdown).toContain("Pattern: Error Handling");
			expect(markdown).toContain("Use try-catch");
		});

		test("returns empty string when inject is none", async () => {
			const content = `# Memories

## Memory
- Tags: test
- Date: 2026-01-26
- Content: Content
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const config: MemoriesConfig = { enabled: true, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			const markdown = await manager.getMemoriesMarkdown();

			expect(markdown).toBe("");
		});

		test("returns empty string when disabled", async () => {
			const config: MemoriesConfig = { enabled: false, inject: "auto" };
			const manager = new MemoryManager(config, testBaseDir);
			const markdown = await manager.getMemoriesMarkdown();

			expect(markdown).toBe("");
		});
	});

	describe("isEnabled", () => {
		test("returns true when enabled", () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			expect(manager.isEnabled()).toBe(true);
		});

		test("returns false when disabled", () => {
			const config: MemoriesConfig = { enabled: false, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			expect(manager.isEnabled()).toBe(false);
		});
	});

	describe("getInjectMode", () => {
		test("returns auto when configured", () => {
			const manager = new MemoryManager(defaultConfig, testBaseDir);
			expect(manager.getInjectMode()).toBe("auto");
		});

		test("returns manual when configured", () => {
			const config: MemoriesConfig = { enabled: true, inject: "manual" };
			const manager = new MemoryManager(config, testBaseDir);
			expect(manager.getInjectMode()).toBe("manual");
		});

		test("returns none when configured", () => {
			const config: MemoriesConfig = { enabled: true, inject: "none" };
			const manager = new MemoryManager(config, testBaseDir);
			expect(manager.getInjectMode()).toBe("none");
		});
	});

	describe("edge cases", () => {
		test("handles malformed markdown gracefully", async () => {
			const content = `# Memories

Some random text without proper format

## Valid Memory
- Tags: valid
- Date: 2026-01-26
- Content: Valid content

Invalid section
- Tags: invalid
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const memories = await manager.loadMemories();

			// Should still parse valid memory
			expect(memories.length).toBeGreaterThanOrEqual(1);
			const validMemory = memories.find((m) => m.title === "Valid Memory");
			expect(validMemory).toBeDefined();
		});

		test("handles empty tags gracefully", async () => {
			const content = `# Memories

## Memory Without Tags
- Tags: 
- Date: 2026-01-26
- Content: Content without tags
`;
			await fs.writeFile(memoriesPath, content, "utf-8");

			const manager = new MemoryManager(defaultConfig, testBaseDir);
			const memories = await manager.loadMemories();

			expect(memories).toHaveLength(1);
			expect(memories[0].tags).toEqual([]);
		});
	});
});
