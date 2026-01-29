/**
 * 組み込みプリセット定義
 *
 * バイナリ実行時にファイルシステムからプリセットを読み込めない場合のフォールバック。
 * presets/*.yml の内容をそのまま埋め込んでいる。
 */

export const EMBEDDED_PRESETS: Record<string, Record<string, unknown>> = {
	simple: {
		preset: "simple",
		hats: {},
	},

	tdd: {
		preset: "tdd",
		hats: {
			tester: {
				name: "Tester",
				triggers: ["task.start", "code.written"],
				publishes: ["tests.failing", "tests.passing"],
				instructions: `あなたはテスターです。
- task.start: 要件に基づいてテストを作成してください。テストは失敗することを確認し、tests.failing を出力してください。
- code.written: 実装後、テストを再実行してください。全テスト通過なら tests.passing、失敗なら tests.failing を出力してください。`,
			},
			implementer: {
				name: "Implementer",
				triggers: ["tests.failing"],
				publishes: ["code.written"],
				instructions: `あなたは実装者です。
失敗しているテストを通すための最小限のコードを実装してください。
実装完了後、code.written を出力してください。`,
			},
			refactorer: {
				name: "Refactorer",
				triggers: ["tests.passing"],
				publishes: ["code.written", "LOOP_COMPLETE"],
				instructions: `あなたはリファクタラーです。
テストが通っている状態で、コードの品質を向上させてください。
- リファクタリングが必要な場合: code.written を出力してください。
- 完了した場合: LOOP_COMPLETE を出力してください。`,
			},
		},
	},

	"spec-driven": {
		version: "1.0",
		backend: { type: "claude" },
		loop: {
			max_iterations: 50,
			completion_promise: "LOOP_COMPLETE",
		},
		hats: {
			planner: {
				name: "📋 Planner",
				triggers: ["task.start"],
				publishes: ["plan.ready"],
				instructions: `You are the PLANNER hat. Your job is to analyze and plan.

Tasks:
1. Analyze the issue requirements thoroughly
2. Break down into small, testable steps
3. Identify dependencies and risks
4. Write a clear implementation plan in scratchpad

When plan is ready:
- Output: EVENT: plan.ready`,
			},
			builder: {
				name: "🔨 Builder",
				triggers: ["plan.ready", "review.revise"],
				publishes: ["build.done"],
				instructions: `You are the BUILDER hat. Your job is to implement the plan.

Tasks:
1. Follow the plan in scratchpad
2. Implement step by step
3. Write tests alongside implementation
4. Update scratchpad with progress

When implementation is done:
- Output: EVENT: build.done`,
			},
			reviewer: {
				name: "🔍 Reviewer",
				triggers: ["build.done"],
				publishes: ["review.approved", "review.revise", "LOOP_COMPLETE"],
				instructions: `You are the REVIEWER hat. Your job is to verify quality.

Check:
1. Does code meet all requirements?
2. Are tests comprehensive?
3. Is code clean and maintainable?
4. Any bugs or edge cases missed?

Decisions:
- If issues found: EVENT: review.revise
- If quality is good: EVENT: review.approved
- If complete and ready for PR: EVENT: LOOP_COMPLETE`,
			},
		},
		gates: {
			after_plan: true,
			after_implementation: false,
			before_pr: true,
		},
		state: {
			use_github_labels: true,
			use_scratchpad: true,
		},
	},
};

export function getEmbeddedPreset(name: string): Record<string, unknown> | null {
	return EMBEDDED_PRESETS[name] ?? null;
}

export function getAvailablePresetNames(): string[] {
	return Object.keys(EMBEDDED_PRESETS);
}
