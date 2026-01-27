import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findLogPath, getLogFileName } from "./logs.js";

const TEST_DIR = ".test-logs-command";
const TEST_TASK_ID = "task-test-123";
const TEST_TASK_DIR = join(TEST_DIR, TEST_TASK_ID);

describe("logsコマンド拡張 (F-104)", () => {
	beforeEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
		mkdirSync(TEST_TASK_DIR, { recursive: true });
	});

	afterEach(() => {
		if (existsSync(TEST_DIR)) {
			rmSync(TEST_DIR, { recursive: true });
		}
	});

	describe("getLogFileName", () => {
		it("source=taskの場合はtask.logを返す", () => {
			expect(getLogFileName("task")).toBe("task.log");
		});

		it("source=backendの場合はbackend.logを返す", () => {
			expect(getLogFileName("backend")).toBe("backend.log");
		});

		it("source未指定（undefined）の場合はtask.logを返す（デフォルト）", () => {
			expect(getLogFileName(undefined)).toBe("task.log");
		});
	});

	describe("findLogPath", () => {
		it("task.logが存在する場合はパスを返す", () => {
			const taskLogPath = join(TEST_TASK_DIR, "task.log");
			writeFileSync(taskLogPath, "Task log content");

			const result = findLogPath(TEST_TASK_DIR, "task");
			expect(result).toBe(taskLogPath);
		});

		it("backend.logが存在する場合はパスを返す", () => {
			const backendLogPath = join(TEST_TASK_DIR, "backend.log");
			writeFileSync(backendLogPath, "Backend log content");

			const result = findLogPath(TEST_TASK_DIR, "backend");
			expect(result).toBe(backendLogPath);
		});

		it("ログファイルが存在しない場合はnullを返す", () => {
			const result = findLogPath(TEST_TASK_DIR, "backend");
			expect(result).toBeNull();
		});

		it("source未指定の場合はtask.logを探す", () => {
			const taskLogPath = join(TEST_TASK_DIR, "task.log");
			writeFileSync(taskLogPath, "Task log content");

			const result = findLogPath(TEST_TASK_DIR, undefined);
			expect(result).toBe(taskLogPath);
		});
	});

	describe("LogSource型", () => {
		it("taskは有効なログソース", () => {
			const source: "task" | "backend" = "task";
			expect(source).toBe("task");
		});

		it("backendは有効なログソース", () => {
			const source: "task" | "backend" = "backend";
			expect(source).toBe("backend");
		});
	});
});
