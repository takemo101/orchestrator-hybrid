import { z } from "zod";

export const HatSchema = z.object({
	name: z.string().optional(),
	triggers: z.array(z.string()),
	publishes: z.array(z.string()),
	instructions: z.string().optional(),
});

export const ConfigSchema = z.object({
	version: z.string().default("1.0"),
	backend: z.object({
		type: z.enum(["claude", "opencode", "gemini"]).default("claude"),
		model: z.string().optional(),
	}),
	loop: z.object({
		max_iterations: z.number().default(100),
		completion_promise: z.string().default("LOOP_COMPLETE"),
		idle_timeout_secs: z.number().default(1800),
	}),
	hats: z.record(z.string(), HatSchema).optional(),
	gates: z
		.object({
			after_plan: z.boolean().default(true),
			after_implementation: z.boolean().default(false),
			before_pr: z.boolean().default(true),
		})
		.optional(),
	quality: z
		.object({
			min_score: z.number().default(8),
			auto_approve_above: z.number().default(9),
		})
		.optional(),
	state: z
		.object({
			use_github_labels: z.boolean().default(true),
			use_scratchpad: z.boolean().default(true),
			scratchpad_path: z.string().default(".agent/scratchpad.md"),
		})
		.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
export type Hat = z.infer<typeof HatSchema>;

export interface Issue {
	number: number;
	title: string;
	body: string;
	labels: string[];
	state: string;
}

export interface LoopContext {
	issue: Issue;
	iteration: number;
	maxIterations: number;
	scratchpadPath: string;
	promptPath: string;
	completionPromise: string;
	autoMode: boolean;
}

export interface BackendResult {
	output: string;
	exitCode: number;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoopEvent {
	type: string;
	timestamp: Date;
	data?: Record<string, unknown>;
}
