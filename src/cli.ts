#!/usr/bin/env bun
/**
 * orchestrator-hybrid v3.0.0 CLI エントリーポイント
 *
 * TODO: 各機能のコマンドを追加予定
 */

import { Command } from "commander";

const program = new Command();

program
	.name("orch")
	.description("AI agent orchestrator - GitHub Issue driven automation")
	.version("3.0.0");

program.parse();
