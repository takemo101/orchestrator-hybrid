# Ralph Orchestrator - 取り入れるべき機能メモ

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator (v2.0.0)

---

## 高優先度

### 1. Memories System (永続的な学習)

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#memories-and-tasks

#### 概要
- `.agent/memories.md` にセッション間で学習内容を保存
- 発見したパターン、アーキテクチャ決定、解決策を蓄積
- 複数ループ間で共有（worktreeでもシンボリックリンクで共有）

#### ralph.yml 設定

```yaml
# Memories — persistent learning across sessions (enabled by default)
memories:
  enabled: true           # Set false to disable
  inject: auto            # auto, manual, or none
```

**inject オプション:**
- `auto`: 自動的にプロンプトに注入
- `manual`: エージェントが明示的に読み込む
- `none`: 注入しない

#### CLIコマンド

```bash
# Memory management (persistent learning)
ralph tools memory add "content" -t pattern --tags tag1,tag2
ralph tools memory search "query"
ralph tools memory list
ralph tools memory show <id>
ralph tools memory delete <id>
```

#### 保存内容の例
- Codebase patterns and conventions discovered
- Architectural decisions and rationale
- Recurring problem solutions (fixes)
- Project-specific context

#### 現状との差分
- 現在はscratchpadのみ（セッション内）
- memoriesは複数セッション間で永続化

#### 実装タスク
1. `MemoriesConfig` スキーマを `types.ts` に追加
2. `.agent/memories.md` の読み書きモジュール作成
3. プロンプト生成時にmemoriesを注入するオプション追加
4. `orch tools memory` CLIサブコマンド実装

---

### 2. Tasks System (ランタイムタスク追跡)

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#memories-and-tasks

#### 概要
- `.agent/tasks.jsonl` でタスクをJSONL形式で管理
- 依存関係の追跡（`--blocked-by` オプション）
- ループ完了検証に使用

#### ralph.yml 設定

```yaml
# Tasks — runtime work tracking (enabled by default)
tasks:
  enabled: true           # Set false to use scratchpad-only mode
```

#### CLIコマンド

```bash
# Task management (runtime tracking)
ralph tools task add "Title" -p 2              # Create task (priority 1-5)
ralph tools task add "X" --blocked-by Y        # With dependency
ralph tools task list                           # All tasks
ralph tools task ready                          # Unblocked tasks only
ralph tools task close <id>                     # Mark complete
```

#### JSONL形式（推定）

```jsonl
{"id": "task-001", "title": "Add auth", "priority": 2, "status": "open", "blocked_by": []}
{"id": "task-002", "title": "Add tests", "priority": 3, "status": "open", "blocked_by": ["task-001"]}
```

#### 実装タスク
1. `TasksConfig` スキーマを `types.ts` に追加
2. `.agent/tasks.jsonl` の読み書きモジュール作成
3. タスク依存関係の解決ロジック
4. `orch tools task` CLIサブコマンド実装

---

### 3. Session Recording (セッション記録)

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#ralph-run-options

#### 概要
- `--record-session <FILE>` でJSONLにセッション記録
- デバッグやテストのリプレイに使用
- Smoke testで活用（recorded fixtures）

#### CLI使用例

```bash
# Record a session
ralph run -c ralph.yml --record-session session.jsonl -p "your prompt"

# Or capture raw CLI output
claude -p "your prompt" 2>&1 | tee output.txt
```

#### Smoke Test活用

```
crates/ralph-core/tests/fixtures/basic_session.jsonl — Claude CLI session
crates/ralph-core/tests/fixtures/kiro/ — Kiro CLI sessions
```

記録されたJSONLフィクスチャでテスト実行（APIコール不要、高速、決定的）

#### 実装タスク
1. `--record-session <FILE>` CLIオプション追加
2. セッション記録モジュール（各イテレーションの入出力をJSONL化）
3. リプレイ機能（テスト用）
4. Smoke testへの統合

---

### 4. Multi-Loop Concurrency (並列ループ実行)

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#multi-loop-concurrency

#### 概要
- git worktreeを使った並列実行
- 複数タスクを同時進行し、自動マージ
- 現状の`--issues`オプションより高度な並列処理（ファイルシステム分離）

#### 仕組み

```
┌─────────────────────────────────────────────────────────────────────┐
│  Terminal 1                    │  Terminal 2                       │
│  ralph run -p "Add auth"       │  ralph run -p "Add logging"       │
│  [acquires lock, runs in-place]│  [spawns to worktree]             │
│           ↓                    │           ↓                       │
│     Primary loop               │  .worktrees/ralph-20250124-a3f2/  │
│           ↓                    │           ↓                       │
│     LOOP_COMPLETE              │     LOOP_COMPLETE → auto-merge    │
└─────────────────────────────────────────────────────────────────────┘
```

1. **First loop** acquires `.ralph/loop.lock` and runs in-place (the primary loop)
2. **Additional loops** automatically spawn into `.worktrees/<loop-id>/`
3. **Each loop** has isolated events, tasks, and scratchpad
4. **Memories are shared** — symlinked back to the main repo's `.agent/memories.md`
5. **On completion**, worktree loops automatically spawn a merge-ralph to integrate changes

#### CLI

```bash
# First loop acquires lock, runs in-place
ralph run -p "Add authentication"

# In another terminal — automatically spawns to worktree
ralph run -p "Add logging"

# Check running loops
ralph loops

# View logs from a specific loop
ralph loops logs <loop-id>
ralph loops logs <loop-id> --follow  # Real-time streaming

# Force sequential execution (wait for lock)
ralph run --exclusive -p "Task that needs main workspace"

# Skip auto-merge (keep worktree for manual handling)
ralph run --no-auto-merge -p "Experimental feature"
```

#### Loop States

| State | Description |
|-------|-------------|
| `running` | Loop is actively executing |
| `queued` | Completed, waiting for merge |
| `merging` | Merge operation in progress |
| `merged` | Successfully merged to main |
| `needs-review` | Merge failed, requires manual resolution |
| `crashed` | Process died unexpectedly |
| `orphan` | Worktree exists but not tracked |
| `discarded` | Explicitly abandoned by user |

#### ファイル構造

```
project/
├── .ralph/
│   ├── loop.lock          # Primary loop indicator
│   ├── loops.json         # Loop registry
│   ├── merge-queue.jsonl  # Merge event log
│   └── events.jsonl       # Primary loop events
├── .agent/
│   └── memories.md        # Shared across all loops
└── .worktrees/
    └── ralph-20250124-a3f2/
        ├── .ralph/events.jsonl    # Loop-isolated
        ├── .agent/
        │   ├── memories.md → ../../.agent/memories.md  # Symlink
        │   └── scratchpad.md      # Loop-isolated
        └── [project files]
```

#### Auto-Merge Workflow

merge-ralph プロセスは専用のHat collectionを使用：

| Hat | Trigger | Purpose |
|-----|---------|---------|
| `merger` | `merge.start` | Performs `git merge`, runs tests |
| `resolver` | `conflict.detected` | Resolves merge conflicts by understanding intent |
| `tester` | `conflict.resolved` | Verifies tests pass after conflict resolution |
| `cleaner` | `merge.done` | Removes worktree and branch |
| `failure_handler` | `*failed`, `unresolvable` | Marks loop for manual review |

#### 実装タスク
1. `.orch/loop.lock` でプライマリループを管理
2. git worktree作成・管理モジュール
3. `.worktrees/<loop-id>/` にワークツリーを生成
4. 完了時に自動マージ（AI駆動のコンフリクト解決）
5. `orch loops` CLIサブコマンド群

---

## 中優先度

### 5. Per-Hat Backend Configuration

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#custom-backends-and-per-hat-configuration

#### 概要
- Hat毎に異なるバックエンドを使用可能
- コスト最適化やタスク特化に有用

#### ralph.yml 設定

```yaml
cli:
  backend: "claude"  # Default for Ralph and hats without explicit backend

hats:
  builder:
    name: "🔨 Builder"
    description: "Implements code"
    triggers: ["build.task"]
    publishes: ["build.done"]
    backend: "claude"        # Explicit: Claude for coding

  researcher:
    name: "🔍 Researcher"
    description: "Researches technical questions"
    triggers: ["research.task"]
    publishes: ["research.done"]
    backend:                 # Kiro with custom agent (has MCP tools)
      type: "kiro"
      agent: "researcher"

  reviewer:
    name: "👀 Reviewer"
    description: "Reviews code changes"
    triggers: ["review.task"]
    publishes: ["review.done"]
    backend: "gemini"        # Different model for fresh perspective
```

#### Backend Types

| Type | Syntax | Invocation |
|------|--------|------------|
| Named | `backend: "claude"` | Uses standard backend configuration |
| Kiro Agent | `backend: { type: "kiro", agent: "builder" }` | `kiro-cli --agent builder ...` |
| Custom | `backend: { command: "...", args: [...] }` | Your custom command |

#### 使い分け

| Scenario | Recommended Backend |
|----------|---------------------|
| Complex coding | Claude (best reasoning) |
| AWS/cloud tasks | Kiro with agent (MCP tools) |
| Code review | Different model (fresh perspective) |
| Internal tools | Custom backend |
| Cost optimization | Faster/cheaper model for simple tasks |

#### 実装タスク
1. `HatSchema` に `backend` フィールド追加
2. 複合型 `backend: string | { type: string, agent?: string, command?: string, args?: string[] }`
3. Hat実行時にbackendを解決するロジック

---

### 6. Custom Backends (カスタムバックエンド)

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#custom-backends-and-per-hat-configuration

#### 概要
- 任意のCLI AIエージェントを統合可能

#### ralph.yml 設定

```yaml
cli:
  backend: "custom"
  command: "my-agent"
  args: ["--headless", "--auto-approve"]
  prompt_mode: "arg"        # "arg" or "stdin"
  prompt_flag: "-p"         # Optional: flag for prompt argument
```

| Field | Description |
|-------|-------------|
| `command` | The CLI command to execute |
| `args` | Arguments inserted before the prompt |
| `prompt_mode` | How to pass the prompt: `arg` (command-line argument) or `stdin` |
| `prompt_flag` | Flag preceding the prompt (e.g., `-p`, `--prompt`). If omitted, prompt is positional. |

#### 実装タスク
1. `CustomBackendConfig` スキーマ追加
2. カスタムバックエンドアダプター実装

---

### 7. Event Emission CLI

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#event-emission

#### 概要
- CLI経由でイベントを発行
- Hat間のハンドオフを明示的に制御

#### CLI

```bash
ralph emit "build.done" "tests: pass, lint: pass"
ralph emit "review.done" --json '{"status": "approved"}'
ralph emit "handoff" --target reviewer "Please review"
```

#### Agent出力内でのイベント発行

```xml
<event topic="impl.done">Implementation complete</event>
<event topic="handoff" target="reviewer">Please review</event>
```

#### 実装タスク
1. `orch emit` CLIコマンド実装
2. `--json` オプションでJSONペイロードサポート
3. `--target` オプションで特定Hatへのハンドオフ

---

### 8. Glob Pattern Event Matching

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#event-routing-and-topic-matching

#### 概要
- イベントトピックのワイルドカードマッチング

#### パターン例

```yaml
triggers: ["build.*"]   # build.done, build.blocked等
triggers: ["*.done"]    # 任意の完了イベント
triggers: ["*"]         # グローバルワイルドカード（フォールバック用）
```

| Pattern | Matches |
|---------|---------|
| `task.start` | Exactly `task.start` |
| `build.*` | `build.done`, `build.blocked`, `build.task`, etc. |
| `*.done` | `build.done`, `review.done`, `test.done`, etc. |
| `*` | Everything (global wildcard — used by Ralph as fallback) |

**Priority Rules:**
- Specific patterns take precedence over wildcards
- If multiple hats have specific subscriptions, that's an error (ambiguous routing)
- Global wildcard (`*`) only triggers if no specific handler exists

#### 実装タスク
1. EventBusにglob matchingロジック追加
2. 優先度解決（具体的パターン > ワイルドカード）

---

### 9. TUI Mode (リアルタイムUI)

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#features

#### 概要
- デフォルトでTUIを表示（ratatui使用）
- リアルタイムでRalphの活動を監視
- `--no-tui` で無効化

#### CLI

```bash
# TUI mode (default) — real-time terminal UI for monitoring
ralph run

# Headless mode (no TUI)
ralph run --no-tui

# TUI idle timeout (default: 30s)
ralph run --idle-timeout 60
```

#### 実装タスク
- 優先度低め（工数大）
- 検討: ink (React for CLI) や blessed-contrib 等

---

## 低優先度（検討のみ）

### 10. より多くのPresets

**参照元:** https://github.com/mikeyobrien/ralph-orchestrator#presets

| Preset | Pattern | Description |
|--------|---------|-------------|
| `adversarial-review` | Critic-Defender | Devil's advocate review style |
| `scientific-method` | Hypothesis-Experiment-Conclude | Experimental approach |
| `mob-programming` | Rotate roles | Simulated mob programming |
| `gap-analysis` | Current-Target-Plan | Gap identification |
| `incident-response` | Triage-Fix-Postmortem | Production incident handling |

### 11. Hat Validation Rules
- description必須化
- 予約トリガーの禁止（task.start, task.resume）
- 曖昧なルーティング検出

---

## 現orchestrator-hybridとの比較

| 機能 | orchestrator-hybrid | ralph-orchestrator |
|------|---------------------|-------------------|
| 言語 | TypeScript/Bun | Rust |
| 並列実行 | `--issues` (同一ワークスペース) | git worktree (隔離) |
| 状態管理 | scratchpad | memories + tasks |
| イベント | JSONL | JSONL + glob matching |
| UI | CLI出力のみ | TUI (ratatui) |
| バックエンド | claude/opencode/gemini/container | 7種 + custom |
| Per-Hat Backend | なし | あり |
| Session Recording | なし | あり |

---

## 推奨実装順序

1. **Per-Hat/Step Model Selection** - Hat毎にモデルを選択可能に（下記詳細）
2. **Memories System** - 学習の永続化は価値が高い
3. **Tasks System** - タスク追跡の標準化
4. **Session Recording** - デバッグ・テスト容易化
5. **Multi-Loop (worktree)** - 真の並列実行
6. **Per-Hat Backend** - 柔軟性向上
7. **Glob Pattern Event Matching** - イベントルーティング改善
8. **TUI** - UX向上（優先度低め、工数大）

---

## Per-Hat/Step Model Selection (実装予定)

**参照元:** https://github.com/nrslib/takt

### 概要

taktのStep-based Workflowから着想。
Hat毎に異なるモデルを指定可能にする。

### ユースケース

- **コスト最適化**: 軽いタスク（lint、format確認）はHaiku、重要な判断（設計、レビュー）はOpus
- **タスク特化**: Planningは推論重視でOpus、実装はバランス重視でSonnet
- **実験**: 新モデルを特定のHatで試す

### Claude Code CLI対応

```bash
claude --model <model>
```

**対応エイリアス:**
- `opus` → claude-opus-4-5
- `sonnet` → claude-sonnet-4-5
- `haiku` → claude-haiku-4-5
- フルネームも可: `claude-sonnet-4-5-20250929`

### 設計案

#### orch.yml 設定

```yaml
version: "1.0"

backend:
  type: claude
  model: sonnet  # グローバルデフォルト（省略時はClaude CLIのデフォルト）

hats:
  planner:
    name: "📋 Planner"
    triggers: ["task.start"]
    publishes: ["plan.ready"]
    model: opus  # このHatはOpusを使用
    instructions: |
      計画を立てる...

  implementer:
    name: "🔨 Implementer"
    triggers: ["plan.ready"]
    publishes: ["code.written"]
    # model省略 → backend.modelを継承 (sonnet)
    instructions: |
      実装する...

  reviewer:
    name: "🔍 Reviewer"
    triggers: ["code.written"]
    publishes: ["review.approved", "LOOP_COMPLETE"]
    model: haiku  # 軽量モデルで高速レビュー
    instructions: |
      レビューする...
```

#### 解決優先度

1. `hats.<hat>.model` (Hat固有)
2. `backend.model` (グローバル)
3. Claude CLIデフォルト (sonnet)

### 実装タスク

1. **types.ts**: `HatSchema`に`model`フィールド追加
   ```typescript
   export const HatSchema = z.object({
     name: z.string().optional(),
     triggers: z.array(z.string()),
     publishes: z.array(z.string()),
     instructions: z.string().optional(),
     model: z.string().optional(),  // 追加
   });
   ```

2. **types.ts**: `backend.model`を明示的に追加（既存だが確認）
   ```typescript
   backend: z.object({
     type: z.enum(["claude", "opencode", "gemini", "container"]).default("claude"),
     model: z.string().optional(),
   }),
   ```

3. **claude-adapter.ts**: `--model`フラグを渡す
   ```typescript
   const args = ["-p", prompt];
   if (model) {
     args.unshift("--model", model);
   }
   ```

4. **loop.ts**: Hatからmodelを取得してadapterに渡す
   ```typescript
   const model = currentHat?.model ?? config.backend.model;
   await adapter.execute(prompt, { model });
   ```

5. **テスト追加**
   - Hat毎のmodel指定が正しく渡されるか
   - フォールバック（Hat→backend→デフォルト）の動作

6. **README.md更新**: model選択機能のドキュメント

### 注意点

- OpenCodeバックエンドは要調査（`--model`相当があるか）
- Geminiバックエンドは別途対応が必要
- containerバックエンドは内部でclaudeを呼ぶので対応可能
