# orchestrator-hybrid v1.4.0機能 基本設計書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | BASIC-ORCH-004 |
| バージョン | 1.0.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-26 |
| 最終更新日 | 2026-01-26 |
| 作成者 | AI Assistant |
| 承認者 | - |
| 関連要件定義書 | REQ-ORCH-001 v1.4.0 |
| 関連基本設計書 | BASIC-ORCH-001 v1.0.0 (Phase 1-2), BASIC-ORCH-002 v1.0.0 (Phase 3) |

---

## 1. 概要

### 1.1 目的

orchestrator-hybrid v1.4.0（Phase 4）として、以下の機能を追加し、真の並列実行と永続的な学習を実現する：

1. **Per-Hat/Step Model Selection（F-013）**: Hat毎に異なるAIモデルを指定可能にし、コスト最適化とタスク特化を実現
2. **Memories System（F-014）**: セッション間で学習内容を永続化し、プロジェクト固有の知識を蓄積
3. **Tasks System（F-015）**: タスクをJSONL形式で管理し、依存関係を追跡
4. **Session Recording（F-016）**: セッションを記録してデバッグやテストに活用
5. **Multi-Loop Concurrency（F-017）**: git worktreeを使った完全に隔離された並列実行
6. **Per-Hat Backend Configuration（F-018）**: Hat毎に異なるバックエンド（Claude/Gemini/Kiro/カスタム）を指定可能
7. **Custom Backends（F-019）**: 任意のCLI AIエージェントを統合可能
8. **Event Emission CLI（F-020）**: CLI経由で明示的にイベントを発行
9. **Glob Pattern Event Matching（F-021）**: イベントトピックのワイルドカードマッチング

### 1.2 背景

Phase 1-3（v1.2.0-v1.3.0）で以下の機能を実装済み：

- Docker/Host/Container-use sandbox対応（F-001~F-003）
- JSON Schema対応（F-004~F-005）
- 改善Issue自動作成（F-006~F-007）
- 実行ログリアルタイム確認（F-008）
- PR自動マージ（F-009）
- リアルタイムログ監視（F-010）
- Issue依存関係管理（F-011）
- Issueステータスラベル（F-012）

しかし、以下の課題が残っている：

- すべてのHatで同じAIモデルを使用するため、コスト最適化ができない
- セッション間で学習内容が失われ、同じ問題を繰り返し解決している
- 並列実行時にファイルシステムの競合が発生する可能性がある
- Hat毎に異なるバックエンド（Claude/Gemini等）を使い分けられない
- カスタムAIエージェントを統合できない

### 1.3 スコープ

#### スコープ内

- Per-Hat/Step Model Selection（F-013）
- Memories System（F-014）
- Tasks System（F-015）
- Session Recording（F-016）
- Multi-Loop Concurrency（F-017）
- Per-Hat Backend Configuration（F-018）
- Custom Backends（F-019）
- Event Emission CLI（F-020）
- Glob Pattern Event Matching（F-021）

#### スコープ外

- Memoriesの自動要約・圧縮機能
- Tasksの自動優先度調整
- Worktreeの自動ガベージコレクション
- バックエンドの自動選択
- イベントトピックの階層的管理

### 1.4 用語定義

| 用語 | 定義 |
|------|------|
| Per-Hat Model Selection | Hat毎に異なるAIモデル（opus/sonnet/haiku）を指定する機能 |
| Memories | セッション間で永続化される学習内容（パターン、解決策等） |
| Tasks | タスク管理システム。依存関係を追跡し、ループ完了検証に使用 |
| Session Recording | セッションをJSONL形式で記録し、リプレイ可能にする機能 |
| Worktree | git worktreeを使った並列実行環境。ファイルシステムを完全に分離 |
| Per-Hat Backend | Hat毎に異なるバックエンド（Claude/Gemini/Kiro）を指定する機能 |
| Custom Backend | 任意のCLI AIエージェントをバックエンドとして統合する機能 |
| Event Emission | CLI経由で明示的にイベントを発行する機能 |
| Glob Pattern Matching | イベントトピックのワイルドカード（`*`）マッチング |

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────────────┐
│                   Orchestrator Hybrid v1.4.0                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │  Input   │───▶│  Loop    │───▶│  Output  │                      │
│  │  Layer   │    │  Engine  │    │  Layer   │                      │
│  └──────────┘    └──────────┘    └──────────┘                      │
│       │              │  ▲            │                              │
│       ▼              ▼  │            ▼                              │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                      │
│  │  GitHub  │    │   Hat    │    │   PR     │                      │
│  │  Issue   │    │  System  │    │ Creation │                      │
│  └──────────┘    └──────────┘    └──────────┘                      │
│                      │                                              │
│                      ▼                                              │
│         ┌────────────────────────────────────┐                      │
│         │  Per-Hat Model Selection (F-013)  │ ← 新規               │
│         ├────────────────────────────────────┤                      │
│         │  hats.<hat>.model: opus/sonnet    │                      │
│         │  → backend.model を継承            │                      │
│         └────────────────────────────────────┘                      │
│                      │                                              │
│                      ▼                                              │
│         ┌────────────────────────────────────┐                      │
│         │ Per-Hat Backend Config (F-018)    │ ← 新規               │
│         ├────────────────────────────────────┤                      │
│         │  hats.<hat>.backend: claude       │                      │
│         │  hats.<hat>.backend:               │                      │
│         │    type: kiro, agent: builder     │                      │
│         └────────────────────────────────────┘                      │
│                      │                                              │
│                      ▼                                              │
│         ┌────────────────────────────────────┐                      │
│         │   Custom Backends (F-019)         │ ← 新規               │
│         ├────────────────────────────────────┤                      │
│         │  backend:                          │                      │
│         │    command: my-agent               │                      │
│         │    args: [--headless]              │                      │
│         │    prompt_mode: arg/stdin          │                      │
│         └────────────────────────────────────┘                      │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Memories System (新規 F-014)                     │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │  .agent/     │  │   Memory     │  │   Inject     │       │   │
│  │  │ memories.md  │  │   Manager    │  │   to Prompt  │       │   │
│  │  │              │  │              │  │              │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │                                                              │   │
│  │  - セッション間で永続化                                       │   │
│  │  - worktree間でシンボリックリンク共有                         │   │
│  │  - inject: auto/manual/none                                 │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │               Tasks System (新規 F-015)                       │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │  .agent/     │  │    Task      │  │  Dependency  │       │   │
│  │  │ tasks.jsonl  │  │   Manager    │  │   Tracker    │       │   │
│  │  │              │  │              │  │              │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │                                                              │   │
│  │  - JSONL形式でタスク管理                                      │   │
│  │  - blocked_by で依存関係追跡                                  │   │
│  │  - ループ完了検証に使用                                       │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │           Session Recording (新規 F-016)                      │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │  --record-   │  │   Session    │  │   Replay     │       │   │
│  │  │  session     │  │   Recorder   │  │   Engine     │       │   │
│  │  │  <FILE>      │  │              │  │              │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │                                                              │   │
│  │  - JSONL形式でセッション記録                                  │   │
│  │  - リプレイでAPIコール不要                                    │   │
│  │  - Smoke testで使用                                          │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │        Multi-Loop Concurrency (新規 F-017)                    │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │  Primary Loop (in-place)                             │   │   │
│  │  │  - .orch/loop.lock                                   │   │   │
│  │  │  - .agent/events.jsonl                               │   │   │
│  │  │  - .agent/scratchpad.md                              │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  ┌──────────────────────────────────────────────────────┐   │   │
│  │  │  Secondary Loops (worktree)                          │   │   │
│  │  │  - .worktrees/orch-20260126-a3f2/                    │   │   │
│  │  │    ├── .orch/events.jsonl                            │   │   │
│  │  │    ├── .agent/                                       │   │   │
│  │  │    │   ├── memories.md → ../../.agent/memories.md    │   │   │
│  │  │    │   ├── scratchpad.md                             │   │   │
│  │  │    │   └── tasks.jsonl                               │   │   │
│  │  │    └── [project files]                               │   │   │
│  │  └──────────────────────────────────────────────────────┘   │   │
│  │                                                              │   │
│  │  - 最初のループはプライマリ環境                               │   │
│  │  - 2つ目以降は自動的にworktreeに分離                          │   │   │
│  │  - memoriesはシンボリックリンクで共有                         │   │
│  │  - 完了時に自動マージ（AI駆動）                               │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │         Event Emission & Matching (新規 F-020, F-021)        │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │   │
│  │  │  orch emit   │  │    Event     │  │    Glob      │       │   │
│  │  │  <topic>     │  │    Bus       │  │   Pattern    │       │   │
│  │  │  <message>   │  │              │  │   Matcher    │       │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘       │   │
│  │                                                              │   │
│  │  - CLI経由でイベント発行                                      │   │
│  │  - triggers: ["build.*"] でマッチング                        │   │
│  │  - 具体的パターンが優先                                       │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 コンポーネント図

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLI Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  orch run --issue 42 --auto                                     │
│  orch emit <topic> <message>                                    │
│  orch tools memory add/search/list/show/delete                  │
│  orch tools task add/list/ready/close                           │
│  orch loops                                                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Core Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Loop Engine │  │  Hat System  │  │  Event Bus   │          │
│  │              │  │              │  │              │          │
│  │  - Model     │  │  - Backend   │  │  - Glob      │          │
│  │    Selection │  │    Selection │  │    Matching  │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Memory     │  │     Task     │  │   Session    │          │
│  │   Manager    │  │   Manager    │  │   Recorder   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                            │
│  │   Worktree   │  │    Loop      │                            │
│  │   Manager    │  │   Registry   │                            │
│  └──────────────┘  └──────────────┘                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend Layer                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Claude     │  │    Gemini    │  │     Kiro     │          │
│  │   Backend    │  │   Backend    │  │   Backend    │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────┐           │
│  │           Custom Backend Adapter                 │           │
│  │  - command: my-agent                             │           │
│  │  - args: [--headless]                            │           │
│  │  - prompt_mode: arg/stdin                        │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 レイヤー構成

```
┌─────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                          │
│  - CLI Commands (run, emit, tools, loops)                       │
│  - User Interaction                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Application Layer                           │
│  - Loop Engine                                                  │
│  - Hat System (Model Selection, Backend Selection)             │
│  - Event Bus (Glob Pattern Matching)                           │
│  - Memory Manager                                               │
│  - Task Manager                                                 │
│  - Session Recorder                                             │
│  - Worktree Manager                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Domain Layer                                │
│  - Hat (model, backend, triggers, publishes)                    │
│  - Memory (content, tags, inject mode)                          │
│  - Task (id, title, priority, status, blocked_by)               │
│  - Loop (id, state, worktree_path)                              │
│  - Event (topic, message, target)                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Infrastructure Layer                          │
│  - Backend Adapters (Claude, Gemini, Kiro, Custom)             │
│  - File System (memories.md, tasks.jsonl, events.jsonl)        │
│  - Git Worktree                                                 │
│  - Process Executor                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 2.4 技術スタック

| レイヤー | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| **ランタイム** | Bun | 1.0以上 | 既存 |
| **言語** | TypeScript | 5.0以上 | strict mode |
| **スキーマ検証** | zod | 最新 | 設定ファイル検証 |
| **Git操作** | git worktree | - | 並列実行環境分離 |
| **バックエンド** | Claude Code CLI | 最新 | デフォルトバックエンド |
| **バックエンド** | OpenCode CLI | 最新 | オプション |
| **バックエンド** | Gemini CLI | 最新 | オプション（F-018） |
| **バックエンド** | Kiro CLI | 最新 | オプション（F-018） |
| **バックエンド** | Custom CLI | - | ユーザー定義（F-019） |

#### 技術選定理由

| 技術 | 選定理由 |
|------|---------|
| git worktree | ファイルシステムを完全に分離した並列実行を実現。既存のgitリポジトリを活用 |
| JSONL形式 | 追記型のログ形式。セッション記録やタスク管理に最適 |
| シンボリックリンク | worktree間でmemoriesを共有するための軽量な仕組み |
| Claude Code CLI | モデルエイリアス（opus/sonnet/haiku）をサポート。`--model`フラグで簡単に切り替え可能 |
| zod | TypeScript型定義とJSON Schemaを統一管理 |

### 2.5 外部システム連携

```
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator Hybrid v1.4.0                  │
└─────────────────────────────────────────────────────────────┘
                      │                    │
                      ▼                    ▼
          ┌──────────────────┐  ┌──────────────────┐
          │   Claude Code    │  │   OpenCode       │
          │   CLI            │  │   CLI            │
          │   (F-013)        │  │   (F-013)        │
          └──────────────────┘  └──────────────────┘
                      │                    │
                      ▼                    ▼
          ┌──────────────────┐  ┌──────────────────┐
          │  claude --model  │  │  opencode        │
          │  opus/sonnet     │  │  --model ...     │
          └──────────────────┘  └──────────────────┘

                      │
                      ▼
          ┌──────────────────────────────────────┐
          │   Custom Backend (F-019)             │
          │   - command: my-agent                │
          │   - args: [--headless]               │
          │   - prompt_mode: arg/stdin           │
          └──────────────────────────────────────┘

                      │
                      ▼
          ┌──────────────────────────────────────┐
          │   Git Worktree (F-017)               │
          │   - git worktree add                 │
          │   - git worktree list                │
          │   - git worktree remove              │
          └──────────────────────────────────────┘
```

---

## 3. 機能設計

### 3.1 機能一覧

| ID | 機能名 | 概要 | 優先度 | 実装モジュール |
|----|--------|------|--------|---------------|
| F-013 | Per-Hat/Step Model Selection | Hat毎に異なるAIモデルを指定可能 | 必須 | ModelSelector |
| F-014 | Memories System | `.agent/memories.md`にセッション間で学習内容を永続化 | 必須 | MemoryManager |
| F-015 | Tasks System | `.agent/tasks.jsonl`でタスクをJSONL形式で管理 | 必須 | TaskManager |
| F-016 | Session Recording | `--record-session <FILE>`でJSONLにセッション記録 | 必須 | SessionRecorder |
| F-017 | Multi-Loop Concurrency | git worktreeを使った並列実行（ファイルシステム分離） | 重要 | WorktreeManager |
| F-018 | Per-Hat Backend Configuration | Hat毎に異なるバックエンドを指定 | 重要 | BackendSelector |
| F-019 | Custom Backends | 任意のCLI AIエージェントを統合可能 | 重要 | CustomBackendAdapter |
| F-020 | Event Emission CLI | `orch emit`コマンドでCLI経由でイベント発行 | 重要 | EventEmitter |
| F-021 | Glob Pattern Event Matching | イベントトピックのワイルドカードマッチング | 中 | GlobMatcher |

### 3.2 F-013: Per-Hat/Step Model Selection

#### 処理フロー

```
1. Hat実行時に hats.<hat>.model を確認
2. 未指定の場合は backend.model を使用
3. それも未指定の場合はClaude CLIデフォルト（sonnet）
4. --model フラグでClaude Code CLIを実行
```

#### インターフェース

**入力**:
- Hat定義（orch.yml）
- モデル指定（Hat固有またはグローバル）

**出力**:
- 指定されたモデルでのAI実行

#### データ構造

```yaml
backend:
  type: claude
  model: sonnet  # グローバルデフォルト

hats:
  planner:
    model: opus  # このHatはOpusを使用
  implementer:
    # model省略 → backend.modelを継承
  reviewer:
    model: haiku  # 軽量モデルで高速レビュー
```

#### 関連するビジネスルール

- BR-040: モデル解決優先度は `hats.<hat>.model` → `backend.model` → Claude CLIデフォルト
- BR-041: Claude Code CLIのエイリアス（opus/sonnet/haiku）をサポート
- BR-042: フルモデル名（claude-sonnet-4-5-20250929）もサポート

#### エラーハンドリング方針

- モデル名が不正な場合: エラーログ出力、デフォルトモデルにフォールバック
- Claude CLIが利用不可の場合: エラーログ出力、実行を中断

#### 設定ファイル例

```yaml
backend:
  type: claude
  model: sonnet

hats:
  planner:
    model: opus
  implementer:
    # model省略 → backend.model (sonnet) を継承
  reviewer:
    model: haiku
```

---

### 3.3 F-014: Memories System

#### 処理フロー

```
1. セッション中に発見したパターンや解決策を記録
2. .agent/memories.md に追記
3. 次回実行時にmemoriesを読み込み
4. inject: auto の場合はプロンプトに自動注入
```

#### インターフェース

**入力**:
- 学習内容（パターン、アーキテクチャ決定、解決策）
- タグ（オプション）

**出力**:
- `.agent/memories.md`への追記
- プロンプトへの自動注入（inject: auto時）

#### データ構造

```markdown
# Memories

## Pattern: Error Handling
- Tags: pattern, error-handling
- Date: 2026-01-26
- Content: Always use try-catch blocks for async operations

## Architecture Decision: Database
- Tags: architecture, database
- Date: 2026-01-25
- Content: Use PostgreSQL for relational data, Redis for caching
```

#### 関連するビジネスルール

- BR-043: memoriesはworktree間でシンボリックリンクで共有
- BR-044: `inject: auto`時はプロンプトの先頭に注入
- BR-045: `inject: manual`時はエージェントが明示的に読み込む
- BR-046: `inject: none`時は注入しない

#### エラーハンドリング方針

- memoriesファイルが破損している場合: エラーログ出力、空のmemoriesとして扱う
- memoriesファイルのサイズが上限を超えた場合: 警告ログ出力、古いエントリを削除

#### 設定ファイル例

```yaml
memories:
  enabled: true
  inject: auto  # auto, manual, none
```

#### CLIコマンド

```bash
orch tools memory add "content" -t pattern --tags tag1,tag2
orch tools memory search "query"
orch tools memory list
orch tools memory show <id>
orch tools memory delete <id>
```

---

### 3.4 F-015: Tasks System

#### 処理フロー

```
1. タスクをJSONL形式で .agent/tasks.jsonl に記録
2. 依存関係（blocked_by）を追跡
3. orch tools task ready でブロックされていないタスクのみ表示
4. ループ完了検証に使用
```

#### インターフェース

**入力**:
- タスク情報（タイトル、優先度、依存関係）

**出力**:
- `.agent/tasks.jsonl`への追記
- タスク状態の更新

#### データ構造

```jsonl
{"id": "task-001", "title": "Add auth", "priority": 2, "status": "open", "blocked_by": []}
{"id": "task-002", "title": "Add tests", "priority": 3, "status": "open", "blocked_by": ["task-001"]}
```

#### 関連するビジネスルール

- BR-047: タスクIDは自動生成（task-001, task-002...）
- BR-048: 優先度は1-5（1が最高）
- BR-049: `status`は`open`/`in-progress`/`closed`
- BR-050: 依存タスクが完了するまで`ready`に表示されない

#### エラーハンドリング方針

- tasksファイルが破損している場合: エラーログ出力、空のtasksとして扱う
- 依存タスクが存在しない場合: 警告ログ出力、依存関係を無視

#### 設定ファイル例

```yaml
tasks:
  enabled: true
```

#### CLIコマンド

```bash
orch tools task add "Title" -p 2
orch tools task add "X" --blocked-by Y
orch tools task list
orch tools task ready
orch tools task close <id>
```

---

### 3.5 F-016: Session Recording

#### 処理フロー

```
1. --record-session <FILE> オプション指定時にセッション記録を開始
2. 各イテレーションの入力プロンプト、出力、イベントをJSONL化
3. ファイルに追記
4. リプレイ時はJSONLを読み込んでテスト実行（APIコール不要）
```

#### インターフェース

**入力**:
- セッション実行内容（各イテレーションの入出力）

**出力**:
- JSONL形式のセッション記録ファイル

#### データ構造

```jsonl
{"iteration": 1, "hat": "planner", "prompt": "...", "output": "...", "events": ["plan.ready"]}
{"iteration": 2, "hat": "implementer", "prompt": "...", "output": "...", "events": ["code.written"]}
```

#### 関連するビジネスルール

- BR-051: セッション記録は各イテレーション毎に1行追記
- BR-052: リプレイ時はAPIコールせずに記録された出力を使用
- BR-053: Smoke testで記録されたフィクスチャを使用可能

#### エラーハンドリング方針

- 記録ファイルへの書き込み失敗: エラーログ出力、記録をスキップして実行継続
- 記録ファイルのサイズが上限を超えた場合: 警告ログ出力、記録を停止

#### 設定ファイル例

（設定ファイルでの設定は不要。CLIオプションのみ）

#### CLIコマンド

```bash
# セッション記録
orch run --issue 42 --record-session session.jsonl

# リプレイ（テスト用）
orch replay session.jsonl
```

---

### 3.6 F-017: Multi-Loop Concurrency

#### 処理フロー

```
1. 最初のループは .orch/loop.lock を取得してin-place実行
2. 2つ目以降のループは .worktrees/<loop-id>/ にworktreeを作成
3. 各ループは独立したevents/tasks/scratchpadを持つ
4. memoriesはシンボリックリンクで共有
5. ループ完了時に自動マージ（AI駆動のコンフリクト解決）
```

#### インターフェース

**入力**:
- 複数のループ実行要求

**出力**:
- プライマリループ（in-place実行）
- セカンダリループ（worktreeに分離）
- 自動マージ結果

#### データ構造

```
project/
├── .orch/
│   ├── loop.lock          # プライマリループ
│   ├── loops.json         # ループレジストリ
│   └── merge-queue.jsonl  # マージイベントログ
├── .agent/
│   └── memories.md        # 全ループで共有
└── .worktrees/
    └── orch-20260126-a3f2/
        ├── .orch/events.jsonl
        ├── .agent/
        │   ├── memories.md → ../../.agent/memories.md
        │   └── scratchpad.md
        └── [project files]
```

#### ループ状態

| 状態 | 説明 |
|------|------|
| `running` | 実行中 |
| `queued` | 完了、マージ待ち |
| `merging` | マージ中 |
| `merged` | マージ完了 |
| `needs-review` | マージ失敗、手動解決必要 |
| `crashed` | プロセス異常終了 |
| `orphan` | worktree存在、未追跡 |
| `discarded` | ユーザーが明示的に破棄 |

#### 関連するビジネスルール

- BR-054: プライマリループは`.orch/loop.lock`で排他制御
- BR-055: セカンダリループは自動的にworktreeに分離
- BR-056: memoriesはシンボリックリンクで共有（他は分離）
- BR-057: ループ完了時に自動マージ（`--no-auto-merge`で無効化可能）
- BR-058: マージ失敗時は`needs-review`状態にして手動解決を促す

#### エラーハンドリング方針

- worktree作成失敗: エラーログ出力、プライマリループの完了を待機
- 自動マージ失敗: `needs-review`状態に遷移、手動解決を促す
- loop.lockの取得失敗: エラーログ出力、worktreeに分離

#### 設定ファイル例

（設定ファイルでの設定は不要。自動的にworktreeに分離）

#### CLIコマンド

```bash
# ターミナル1: プライマリループ
orch run --issue 42 --auto

# ターミナル2: 自動的にworktreeに分離
orch run --issue 43 --auto

# ループ一覧
orch loops

# 特定ループのログ
orch loops logs <loop-id> --follow

# 自動マージをスキップ
orch run --issue 44 --no-auto-merge
```

---

### 3.7 F-018: Per-Hat Backend Configuration

#### 処理フロー

```
1. Hat実行時に hats.<hat>.backend を確認
2. 未指定の場合は backend.type を使用
3. バックエンドに応じたアダプターを初期化
4. Hat実行
```

#### インターフェース

**入力**:
- Hat定義（orch.yml）
- バックエンド指定（Hat固有またはグローバル）

**出力**:
- 指定されたバックエンドでのAI実行

#### データ構造

```yaml
backend:
  type: claude  # グローバルデフォルト

hats:
  builder:
    backend: claude  # Claude for coding
  researcher:
    backend:
      type: kiro
      agent: researcher  # Kiro with MCP tools
  reviewer:
    backend: gemini  # Different model for fresh perspective
```

#### バックエンドタイプ

| タイプ | 構文 | 実行方法 |
|--------|------|----------|
| Named | `backend: "claude"` | 標準バックエンド設定を使用 |
| Kiro Agent | `backend: { type: "kiro", agent: "builder" }` | `kiro-cli --agent builder ...` |
| Custom | `backend: { command: "...", args: [...] }` | カスタムコマンド |

#### 関連するビジネスルール

- BR-059: バックエンド解決優先度は `hats.<hat>.backend` → `backend.type`
- BR-060: Kiro agentは`{ type: "kiro", agent: "<name>" }`形式で指定
- BR-061: カスタムバックエンドは`{ command: "...", args: [...] }`形式で指定

#### エラーハンドリング方針

- バックエンドが利用不可の場合: エラーログ出力、実行を中断
- バックエンド設定が不正な場合: エラーログ出力、デフォルトバックエンドにフォールバック

#### 設定ファイル例

```yaml
backend:
  type: claude

hats:
  builder:
    backend: claude
  researcher:
    backend:
      type: kiro
      agent: researcher
  reviewer:
    backend: gemini
```

---

### 3.8 F-019: Custom Backends

#### 処理フロー

```
1. backend.command と backend.args を読み込み
2. prompt_mode に応じてプロンプトを渡す（arg or stdin）
3. prompt_flag が指定されている場合はフラグを付与
4. カスタムコマンドを実行
```

#### インターフェース

**入力**:
- カスタムバックエンド設定（command, args, prompt_mode, prompt_flag）

**出力**:
- カスタムバックエンドでのAI実行

#### データ構造

```yaml
backend:
  type: custom
  command: "my-agent"
  args: ["--headless", "--auto-approve"]
  prompt_mode: arg        # "arg" or "stdin"
  prompt_flag: "-p"       # オプション
```

#### 設定フィールド

| フィールド | 説明 |
|-----------|------|
| `command` | 実行するCLIコマンド |
| `args` | プロンプト前に挿入される引数 |
| `prompt_mode` | プロンプトの渡し方（`arg`または`stdin`） |
| `prompt_flag` | プロンプト前のフラグ（例: `-p`, `--prompt`） |

#### 関連するビジネスルール

- BR-062: `prompt_mode: arg`時はコマンドライン引数でプロンプトを渡す
- BR-063: `prompt_mode: stdin`時は標準入力でプロンプトを渡す
- BR-064: `prompt_flag`が省略された場合はプロンプトを位置引数として渡す

#### エラーハンドリング方針

- カスタムバックエンドが利用不可の場合: エラーログ出力、実行を中断
- カスタムバックエンドの出力形式が不正な場合: エラーログ出力、実行を中断

#### 設定ファイル例

```yaml
backend:
  type: custom
  command: "my-agent"
  args: ["--headless", "--auto-approve"]
  prompt_mode: arg
  prompt_flag: "-p"
```

---

### 3.9 F-020: Event Emission CLI

#### 処理フロー

```
1. orch emit <topic> <message> でイベントを発行
2. --json オプションでJSONペイロードを渡す
3. --target オプションで特定Hatへのハンドオフ
4. events.jsonlに記録
5. 対応するHatをトリガー
```

#### インターフェース

**入力**:
- イベントトピック
- メッセージまたはJSONペイロード
- ターゲットHat（オプション）

**出力**:
- events.jsonlへのイベント記録
- 対応するHatのトリガー

#### データ構造

```bash
orch emit "build.done" "tests: pass, lint: pass"
orch emit "review.done" --json '{"status": "approved"}'
orch emit "handoff" --target reviewer "Please review"
```

#### Agent出力内でのイベント発行

```xml
<event topic="impl.done">Implementation complete</event>
<event topic="handoff" target="reviewer">Please review</event>
```

#### 関連するビジネスルール

- BR-065: イベントトピックは任意の文字列
- BR-066: `--json`オプション時はJSONペイロードとして解析
- BR-067: `--target`オプション時は特定Hatへのハンドオフ
- BR-068: イベントはevents.jsonlに記録される

#### エラーハンドリング方針

- イベントトピックが不正な場合: エラーログ出力、イベント発行をスキップ
- JSONペイロードが不正な場合: エラーログ出力、イベント発行をスキップ

#### 設定ファイル例

（設定ファイルでの設定は不要。CLIコマンドのみ）

#### CLIコマンド

```bash
orch emit "build.done" "tests: pass, lint: pass"
orch emit "review.done" --json '{"status": "approved"}'
orch emit "handoff" --target reviewer "Please review"
```

---

### 3.10 F-021: Glob Pattern Event Matching

#### 処理フロー

```
1. イベント発行時にトピックを確認
2. 各Hatのトリガーパターンとマッチング
3. 具体的パターンを優先
4. ワイルドカードパターンをフォールバックとして使用
5. マッチしたHatをトリガー
```

#### インターフェース

**入力**:
- イベントトピック
- Hatのトリガーパターン（globパターン）

**出力**:
- マッチしたHatのトリガー

#### データ構造

```yaml
triggers: ["build.*"]   # build.done, build.blocked等
triggers: ["*.done"]    # 任意の完了イベント
triggers: ["*"]         # グローバルワイルドカード（フォールバック用）
```

#### マッチングルール

| パターン | マッチ対象 |
|---------|-----------|
| `task.start` | 完全一致: `task.start` |
| `build.*` | `build.done`, `build.blocked`, `build.task`等 |
| `*.done` | `build.done`, `review.done`, `test.done`等 |
| `*` | すべて（フォールバック） |

#### 優先度ルール

- 具体的パターンがワイルドカードより優先
- 複数のHatが具体的パターンでマッチした場合はエラー（曖昧なルーティング）
- グローバルワイルドカード（`*`）は具体的ハンドラーがない場合のみトリガー

#### 関連するビジネスルール

- BR-069: 具体的パターンがワイルドカードより優先
- BR-070: 複数のHatが同じ具体的パターンでマッチした場合はエラー
- BR-071: グローバルワイルドカード（`*`）はフォールバックとして機能

#### エラーハンドリング方針

- 複数のHatが同じ具体的パターンでマッチした場合: エラーログ出力、実行を中断
- マッチするHatが存在しない場合: 警告ログ出力、イベントを無視

#### 設定ファイル例

```yaml
hats:
  builder:
    triggers: ["build.*"]
  reviewer:
    triggers: ["*.done"]
  fallback:
    triggers: ["*"]
```

---

## 4. 画面一覧

### 4.1 CLIコマンド一覧

| ID | コマンド | 説明 | オプション |
|----|---------|------|-----------|
| CMD-013 | `orch run --issue <番号>` | Hat毎のモデル選択で実行 | `--model <model>` (Hat固有のモデルを上書き) |
| CMD-014 | `orch tools memory add <content>` | Memoryを追加 | `-t <type>`, `--tags <tags>` |
| CMD-015 | `orch tools memory search <query>` | Memoryを検索 | - |
| CMD-016 | `orch tools memory list` | Memory一覧を表示 | - |
| CMD-017 | `orch tools memory show <id>` | Memory詳細を表示 | - |
| CMD-018 | `orch tools memory delete <id>` | Memoryを削除 | - |
| CMD-019 | `orch tools task add <title>` | Taskを追加 | `-p <priority>`, `--blocked-by <id>` |
| CMD-020 | `orch tools task list` | Task一覧を表示 | - |
| CMD-021 | `orch tools task ready` | ブロックされていないTaskを表示 | - |
| CMD-022 | `orch tools task close <id>` | Taskをクローズ | - |
| CMD-023 | `orch run --record-session <file>` | セッションを記録 | - |
| CMD-024 | `orch replay <file>` | セッションをリプレイ | - |
| CMD-025 | `orch loops` | ループ一覧を表示 | - |
| CMD-026 | `orch loops logs <loop-id>` | ループのログを表示 | `--follow` |
| CMD-027 | `orch emit <topic> <message>` | イベントを発行 | `--json`, `--target <hat>` |

---

## 5. データ設計

### 5.1 ファイル構造

```
project/
├── .orch/
│   ├── loop.lock          # プライマリループのロックファイル
│   ├── loops.json         # ループレジストリ
│   └── merge-queue.jsonl  # マージイベントログ
├── .agent/
│   ├── memories.md        # セッション間で永続化される学習内容
│   ├── tasks.jsonl        # タスク管理（JSONL形式）
│   ├── events.jsonl       # イベント履歴
│   └── scratchpad.md      # Scratchpad（既存）
├── .worktrees/
│   └── orch-20260126-a3f2/
│       ├── .orch/events.jsonl
│       ├── .agent/
│       │   ├── memories.md → ../../.agent/memories.md  # シンボリックリンク
│       │   ├── scratchpad.md
│       │   └── tasks.jsonl
│       └── [project files]
└── orch.yml               # 設定ファイル
```

### 5.2 設定ファイル構造（orch.yml拡張）

```yaml
version: "1.0"

# バックエンド設定（拡張 v1.4.0）
backend:
  type: claude
  model: sonnet  # グローバルデフォルト

  # カスタムバックエンド（F-019）
  # type: custom
  # command: "my-agent"
  # args: ["--headless"]
  # prompt_mode: arg  # arg | stdin
  # prompt_flag: "-p"

# サンドボックス設定（v1.2.0）
sandbox:
  type: docker
  fallback: host

# ループ設定（既存）
loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"
  idle_timeout_secs: 1800

# Hat設定（拡張 v1.4.0）
hats:
  planner:
    model: opus  # F-013: Hat毎のモデル選択
    backend: claude  # F-018: Hat毎のバックエンド選択
    triggers: ["task.start"]
    publishes: ["plan.ready"]
  
  implementer:
    # model省略 → backend.model (sonnet) を継承
    backend:  # F-018: Kiro agentを使用
      type: kiro
      agent: builder
    triggers: ["plan.ready"]
    publishes: ["code.written"]
  
  reviewer:
    model: haiku  # F-013: 軽量モデル
    backend: gemini  # F-018: Geminiバックエンド
    triggers: ["*.done"]  # F-021: Glob Pattern Matching
    publishes: ["review.approved", "LOOP_COMPLETE"]

# 承認ゲート（既存）
gates:
  after_plan: true
  after_implementation: false
  before_pr: true

# PR設定（v1.3.0）
pr:
  auto_merge: true
  merge_method: squash
  delete_branch: true
  ci_timeout_secs: 600

# 状態管理（v1.3.0）
state:
  use_github_labels: true
  use_scratchpad: true
  scratchpad_path: ".agent/scratchpad.md"
  label_prefix: "orch"

# 改善Issue自動作成（v1.2.0）
autoIssue:
  enabled: true
  minPriority: medium
  labels:
    - auto-generated
    - improvement

# Memories設定（新規 v1.4.0 F-014）
memories:
  enabled: true
  inject: auto  # auto, manual, none

# Tasks設定（新規 v1.4.0 F-015）
tasks:
  enabled: true
```

### 5.3 TypeScript型定義（拡張）

```typescript
// src/core/types.ts に追加

/**
 * Hat設定のzodスキーマ（拡張 v1.4.0）
 */
export const HatSchema = z.object({
  name: z.string(),
  triggers: z.array(z.string()),
  publishes: z.array(z.string()),
  instructions: z.string().optional(),
  
  // 新規 v1.4.0: Hat毎のモデル選択（F-013）
  model: z.string().optional(),
  
  // 新規 v1.4.0: Hat毎のバックエンド選択（F-018）
  backend: z.union([
    z.string(), // "claude" | "gemini" | "opencode"
    z.object({
      type: z.enum(["kiro", "custom"]),
      agent: z.string().optional(), // Kiro agent名
      command: z.string().optional(), // カスタムコマンド
      args: z.array(z.string()).optional(),
      prompt_mode: z.enum(["arg", "stdin"]).optional(),
      prompt_flag: z.string().optional(),
    }),
  ]).optional(),
});

export type Hat = z.infer<typeof HatSchema>;

/**
 * Memories設定のzodスキーマ（新規 v1.4.0 F-014）
 */
export const MemoriesConfigSchema = z.object({
  enabled: z.boolean().default(true),
  inject: z.enum(["auto", "manual", "none"]).default("auto"),
});

export type MemoriesConfig = z.infer<typeof MemoriesConfigSchema>;

/**
 * Tasks設定のzodスキーマ（新規 v1.4.0 F-015）
 */
export const TasksConfigSchema = z.object({
  enabled: z.boolean().default(true),
});

export type TasksConfig = z.infer<typeof TasksConfigSchema>;

/**
 * 設定ファイル全体のzodスキーマ（拡張版 v1.4.0）
 */
export const ConfigSchema = z.object({
  version: z.string().default("1.0"),
  backend: z.object({
    type: z.enum(["claude", "opencode", "gemini", "kiro", "container", "custom"]).default("claude"),
    model: z.string().optional(),
    
    // カスタムバックエンド設定（F-019）
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    prompt_mode: z.enum(["arg", "stdin"]).optional(),
    prompt_flag: z.string().optional(),
  }),
  container: ContainerConfigSchema,
  sandbox: SandboxConfigSchema.optional(),
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
  state: StateConfigSchema.optional(),
  autoIssue: AutoIssueConfigSchema.optional(),
  pr: PRConfigSchema.optional(),
  
  // 新規 v1.4.0
  memories: MemoriesConfigSchema.optional(),
  tasks: TasksConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * LoopContext拡張（v1.4.0）
 */
export interface LoopContext {
  // ... 既存フィールド
  
  // 新規 v1.4.0
  taskId?: string;
  logDir?: string;
  prConfig?: PRConfig;
  resolveDeps?: boolean;
  ignoreDeps?: boolean;
  recordSession?: string; // セッション記録ファイルパス
  worktreePath?: string; // worktreeパス（セカンダリループの場合）
}
```

---

## 6. 外部インターフェース

### 6.1 GitHub API

| API | 用途 | 機能 |
|-----|------|------|
| GitHub Issue API | Issue取得 | 既存 |
| GitHub PR API | PR作成・マージ | 既存 |
| GitHub Issue Dependencies API | 依存関係管理 | v1.3.0 |
| GitHub Labels API | ステータスラベル管理 | v1.3.0 |

### 6.2 Git Worktree

| コマンド | 用途 | 機能 |
|---------|------|------|
| `git worktree add` | worktree作成 | F-017 |
| `git worktree list` | worktree一覧 | F-017 |
| `git worktree remove` | worktree削除 | F-017 |

### 6.3 Backend CLI

| バックエンド | コマンド | 機能 |
|------------|---------|------|
| Claude Code CLI | `claude --model opus/sonnet/haiku` | F-013 |
| OpenCode CLI | `opencode --model ...` | F-013 |
| Gemini CLI | `gemini ...` | F-018 |
| Kiro CLI | `kiro-cli --agent <name>` | F-018 |
| Custom CLI | `<command> <args>` | F-019 |

---

## 7. 非機能要件対応

### 7.1 性能要件

| ID | 要件 | 目標値 | 測定方法 |
|----|------|--------|----------|
| NFR-P-007 | Memories読み込み時間 | 100ms以内（10MB） | ユニットテスト |
| NFR-P-008 | Tasks読み込み時間 | 50ms以内（1000タスク） | ユニットテスト |
| NFR-P-009 | Worktree作成時間 | 5秒以内 | 統合テスト |

### 7.2 セキュリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-S-007 | Memoriesの機密情報保護 | パスワード、トークンはマスク |
| NFR-S-008 | Tasksの機密情報保護 | パスワード、トークンはマスク |
| NFR-S-009 | Session Recordingの機密情報保護 | パスワード、トークンはマスク |

### 7.3 エラーハンドリング

| エラー種別 | 対処方法 | リトライ |
|-----------|---------|---------|
| Memoriesファイル破損 | エラーログ出力、空のmemoriesとして扱う | なし |
| Tasksファイル破損 | エラーログ出力、空のtasksとして扱う | なし |
| Worktree作成失敗 | エラーログ出力、プライマリループの完了を待機 | なし |
| 自動マージ失敗 | `needs-review`状態に遷移、手動解決を促す | なし |
| カスタムバックエンド失敗 | エラーログ出力、実行を中断 | なし |

---

## 8. 技術スタック

| レイヤー | 技術 | バージョン | 用途 |
|---------|------|-----------|------|
| **ランタイム** | Bun | 1.0以上 | 既存 |
| **言語** | TypeScript | 5.0以上 | strict mode |
| **スキーマ検証** | zod | 最新 | 設定ファイル検証 |
| **Git操作** | git worktree | - | 並列実行環境分離（F-017） |
| **バックエンド** | Claude Code CLI | 最新 | デフォルトバックエンド、モデル選択（F-013） |
| **バックエンド** | OpenCode CLI | 最新 | オプション（F-013） |
| **バックエンド** | Gemini CLI | 最新 | オプション（F-018） |
| **バックエンド** | Kiro CLI | 最新 | オプション（F-018） |
| **バックエンド** | Custom CLI | - | ユーザー定義（F-019） |
| **ファイル形式** | Markdown | - | Memories（F-014） |
| **ファイル形式** | JSONL | - | Tasks（F-015）、Session Recording（F-016） |

---

## 9. 制約事項・前提条件

### 9.1 技術的制約

| 制約 | 詳細 | 理由 |
|------|------|------|
| git worktree | git 2.5以上が必要 | 並列実行環境分離（F-017） |
| Claude Code CLI | インストール・認証済み | モデル選択（F-013） |
| シンボリックリンク | OSがサポートしている必要がある | Memories共有（F-014） |

### 9.2 ビジネス制約

| 制約 | 詳細 |
|------|------|
| 予算 | なし（OSS） |
| スケジュール | Phase 4: 3週間 |
| リソース | 開発者1名 |

### 9.3 前提条件

- GitHub Personal Access Tokenが発行されている
- リポジトリへの書き込み権限がある
- git worktreeが利用可能である
- Claude Code CLIがインストールされている

---

## 10. 用語集

| 用語 | 定義 |
|------|------|
| Per-Hat Model Selection | Hat毎に異なるAIモデル（opus/sonnet/haiku）を指定する機能 |
| Memories | セッション間で永続化される学習内容（パターン、解決策等） |
| Tasks | タスク管理システム。依存関係を追跡し、ループ完了検証に使用 |
| Session Recording | セッションをJSONL形式で記録し、リプレイ可能にする機能 |
| Worktree | git worktreeを使った並列実行環境。ファイルシステムを完全に分離 |
| Per-Hat Backend | Hat毎に異なるバックエンド（Claude/Gemini/Kiro）を指定する機能 |
| Custom Backend | 任意のCLI AIエージェントをバックエンドとして統合する機能 |
| Event Emission | CLI経由で明示的にイベントを発行する機能 |
| Glob Pattern Matching | イベントトピックのワイルドカード（`*`）マッチング |
| JSONL | JSON Lines形式。1行1JSONオブジェクトの追記型ログ形式 |
| シンボリックリンク | ファイルシステムのリンク。worktree間でmemoriesを共有するために使用 |
| トポロジカルソート | 依存関係を考慮した順序付けアルゴリズム |
| AI駆動のコンフリクト解決 | AIがコンフリクトを自動的に解決する機能 |

---

## 11. 詳細設計書リンク

| 機能ID | 機能名 | 詳細設計書 |
|--------|--------|-----------|
| F-013 | Per-Hat/Step Model Selection | [詳細設計書](../detailed/v1.4.0機能/per-hat-model-selection/) |
| F-014 | Memories System | [詳細設計書](../detailed/v1.4.0機能/memories-system/) |
| F-015 | Tasks System | [詳細設計書](../detailed/v1.4.0機能/tasks-system/) |
| F-016 | Session Recording | [詳細設計書](../detailed/v1.4.0機能/session-recording/) |
| F-017 | Multi-Loop Concurrency | [詳細設計書](../detailed/v1.4.0機能/multi-loop-concurrency/) |
| F-018 | Per-Hat Backend Configuration | [詳細設計書](../detailed/v1.4.0機能/per-hat-backend/) |
| F-019 | Custom Backends | [詳細設計書](../detailed/v1.4.0機能/custom-backends/) |
| F-020 | Event Emission CLI | [詳細設計書](../detailed/v1.4.0機能/event-emission-cli/) |
| F-021 | Glob Pattern Event Matching | [詳細設計書](../detailed/v1.4.0機能/glob-pattern-matching/) |
| 共通 | 型定義・セキュリティ | [共通設計書](../detailed/v1.4.0機能/共通/) |

---

## 12. 変更履歴

| 日付 | バージョン | 変更内容 | 担当者 |
|------|-----------|---------|--------|
| 2026-01-26 | 1.0.0 | 初版作成 | AI Assistant |
| 2026-01-26 | 1.0.1 | 詳細設計書リンク追加 | AI Assistant |
