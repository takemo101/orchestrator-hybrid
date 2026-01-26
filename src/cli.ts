#!/usr/bin/env node

/**
 * CLI エントリーポイント
 *
 * v2.0.0 F-102: CLIリファクタリング
 * 各コマンドは src/cli/commands/ に分離
 */

import { Command } from "commander";
import {
	cancelCommand,
	clearCommand,
	emitCommand,
	eventsCommand,
	initCommand,
	logsCommand,
	replayCommand,
	runCommand,
	statusCommand,
	toolsCommand,
} from "./cli/commands/index.js";

const program = new Command();

program
	.name("orch")
	.description("AI agent orchestrator combining Ralph loop with GitHub Issue integration")
	.version("2.0.0");

// コマンド登録
runCommand.register(program);
statusCommand.register(program);
initCommand.register(program);
logsCommand.register(program);
eventsCommand.register(program);
emitCommand.register(program);
cancelCommand.register(program);
clearCommand.register(program);
replayCommand.register(program);
toolsCommand.register(program);

program.parse();
