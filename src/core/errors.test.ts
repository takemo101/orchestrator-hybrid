import { describe, expect, test } from "bun:test";
import { ConfigError, GitHubError, OrchestratorError, SessionError } from "./errors.js";

describe("errors", () => {
	describe("OrchestratorError", () => {
		test("should create with message", () => {
			const error = new OrchestratorError("something failed");
			expect(error.message).toBe("something failed");
			expect(error.name).toBe("OrchestratorError");
			expect(error).toBeInstanceOf(Error);
		});

		test("should create with cause", () => {
			const cause = new Error("root cause");
			const error = new OrchestratorError("wrapper", { cause });
			expect(error.message).toBe("wrapper");
			expect(error.cause).toBe(cause);
		});
	});

	describe("ConfigError", () => {
		test("should create with message", () => {
			const error = new ConfigError("invalid config");
			expect(error.message).toBe("invalid config");
			expect(error.name).toBe("ConfigError");
			expect(error).toBeInstanceOf(OrchestratorError);
			expect(error).toBeInstanceOf(Error);
		});

		test("should create with configPath", () => {
			const error = new ConfigError("bad value", {
				configPath: "orch.yml",
			});
			expect(error.configPath).toBe("orch.yml");
		});
	});

	describe("GitHubError", () => {
		test("should create with message", () => {
			const error = new GitHubError("API failed");
			expect(error.message).toBe("API failed");
			expect(error.name).toBe("GitHubError");
			expect(error).toBeInstanceOf(OrchestratorError);
		});

		test("should create with statusCode", () => {
			const error = new GitHubError("not found", { statusCode: 404 });
			expect(error.statusCode).toBe(404);
		});

		test("should create with cause", () => {
			const cause = new Error("network");
			const error = new GitHubError("failed", { cause });
			expect(error.cause).toBe(cause);
		});
	});

	describe("SessionError", () => {
		test("should create with message", () => {
			const error = new SessionError("session failed");
			expect(error.message).toBe("session failed");
			expect(error.name).toBe("SessionError");
			expect(error).toBeInstanceOf(OrchestratorError);
		});

		test("should create with sessionId", () => {
			const error = new SessionError("crashed", { sessionId: "42" });
			expect(error.sessionId).toBe("42");
		});
	});
});
