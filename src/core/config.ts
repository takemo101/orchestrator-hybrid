import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { type Config, ConfigSchema } from "./types.js";

const DEFAULT_CONFIG_NAME = "orch.yml";

export function loadConfig(configPath?: string): Config {
	const path = configPath ?? findConfigFile();

	if (!path) {
		return getDefaultConfig();
	}

	const content = readFileSync(path, "utf-8");
	const raw = parseYaml(content);
	return ConfigSchema.parse(raw);
}

function findConfigFile(): string | null {
	const candidates = [DEFAULT_CONFIG_NAME, "orch.yaml", ".orch.yml"];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

function getDefaultConfig(): Config {
	return ConfigSchema.parse({
		version: "1.0",
		backend: { type: "claude" },
		loop: {
			max_iterations: 100,
			completion_promise: "LOOP_COMPLETE",
			idle_timeout_secs: 1800,
		},
	});
}
