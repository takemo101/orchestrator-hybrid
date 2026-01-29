# Orchestrator Hybrid

GitHub Issueを入力として、AIエージェントが自動的にタスクを完了するまでループ実行するオーケストレーター。

[Ralph Orchestrator](https://github.com/ralphscheid/ralph-orchestrator)の自動ループ実行と、[Composer Workflow](https://github.com/example/composer-workflow)のGitHub統合・承認ゲートを組み合わせた設計。

## 何ができるか

```
GitHub Issue → AIエージェント自動実行 → 完了検出 → PR作成
                    ↑____反復____↓
```

1. **GitHub Issueを読み込み**、タスク内容をAIに渡すプロンプトを自動生成
2. **Claude/OpenCodeを自動実行**、完了キーワード（`LOOP_COMPLETE`）が出力されるまで反復
3. **Hatシステム**で役割（テスター→実装者→レビュアー）を自動切り替え
4. **承認ゲート**で人間がチェックポイントを設定可能
5. **PR自動作成**でワークフローを完結

---

## クイックスタート

### 前提条件

- [Bun](https://bun.sh/) 1.0以上
- `gh` (GitHub CLI) がインストール・認証済み
- `claude`、`opencode`、または `pi` がインストール済み

### インストール

```bash
git clone https://github.com/takemo101/orchestrator-hybrid.git
cd orchestrator-hybrid
bun install
```

### バイナリとして使用（推奨）

```bash
# バイナリをビルド
bun run build:binary

# 実行
./orch run --issue 123 --auto
```

### 最も簡単な使い方

```bash
# Issue #123 を自動実行（承認ゲートあり）
bun run dev run --issue 123

# 承認ゲートをスキップして完全自動実行
bun run dev run --issue 123 --auto

# 完了後にPRも自動作成
bun run dev run --issue 123 --auto --create-pr
```

---

## 基本的な使い方

### 1. 設定ファイルの初期化（オプション）

```bash
# デフォルト設定で初期化
bun run dev init

# プリセットから初期化
bun run dev init --preset tdd

# 利用可能なプリセット一覧
bun run dev init --list-presets

# ステータスラベルをリポジトリに作成（v1.3.0+）
bun run dev init --labels
```

これにより `orch.yml` が作成されます。設定ファイルがない場合はデフォルト値が使用されます。

### 2. タスクの実行

```bash
bun run dev run --issue <Issue番号> [オプション]
```

#### 主要オプション

| オプション | 短縮形 | 説明 | デフォルト |
|-----------|--------|------|-----------|
| `--issue <番号>` | `-i` | **必須** GitHub Issue番号 | - |
| `--auto` | `-a` | 承認ゲートを自動承認 | false |
| `--create-pr` | - | 完了後にPRを自動作成 | false |
| `--draft` | - | PRをドラフトとして作成 | false |
| `--auto-merge` | - | CI成功後にPRを自動マージ（v1.3.0+） | false |
| `--resolve-deps` | - | 依存Issueを先に実行（v1.3.0+） | false |
| `--ignore-deps` | - | 依存関係を無視（v1.3.0+） | false |
| `--report [パス]` | - | 実行レポートを生成 | .agent/report.md |
| `--preset <名前>` | `-p` | プリセット設定を使用 | - |
| `--backend <種類>` | `-b` | バックエンド: `claude` / `opencode` / `pi` | claude |
| `--max-iterations <数>` | `-m` | 最大反復回数 | 100 |
| `--config <パス>` | `-c` | 設定ファイルのパス | orch.yml |
| `--verbose` | `-v` | 詳細ログを出力 | false |

#### 実行例

```bash
# 基本実行（承認ゲートで一時停止）
bun run dev run --issue 42

# 完全自動実行（人間の介入なし）
bun run dev run --issue 42 --auto

# TDDプリセットで実行
bun run dev run --issue 42 --preset tdd --auto

# OpenCodeバックエンドで実行
bun run dev run --issue 42 --backend opencode --auto

# 最大30回の反復で実行
bun run dev run --issue 42 --max-iterations 30 --auto

# 完了後にドラフトPRを作成
bun run dev run --issue 42 --auto --create-pr --draft

# 実行レポートを生成
bun run dev run --issue 42 --auto --report

# カスタムパスにレポートを生成
bun run dev run --issue 42 --auto --report ./reports/issue-42.md
```

### 3. 状態の確認

```bash
# Issue #42 の現在の状態を表示
bun run dev status --issue 42

# イベント履歴を表示
bun run dev events
```

---

## 並列タスク実行

複数のIssueを同時に実行し、状態を監視できます。

### 複数Issueの並列実行

```bash
# 複数Issueを同時実行
bun run dev run --issues 42,43,44 --auto

# バイナリの場合
./orch run --issues 42,43,44 --auto
```

### タスク状態の確認

```bash
# 全タスクの状態を表示
bun run dev status --all

# 特定タスクの詳細を表示
bun run dev status --task <task-id>
```

### リアルタイム監視

```bash
# タスク状態テーブルをリアルタイムで監視（1秒間隔で更新）
bun run dev logs --table

# 特定タスクのログをリアルタイムで監視（v1.2.0+）
bun run dev logs --task <task-id> --follow

# 最後の50行を表示
bun run dev logs --task <task-id> --lines 50
```

#### logsコマンドオプション（v1.2.0+）

| オプション | 短縮形 | 説明 | デフォルト |
|-----------|--------|------|-----------|
| `--task <id>` | `-t` | 特定タスクのログを表示 | - |
| `--follow` | `-f` | リアルタイムでログをストリーミング | false |
| `--lines <num>` | `-n` | 表示する行数 | 100 |
| `--table` | - | タスク状態テーブルを表示（レガシーモード） | false |
| `--interval <ms>` | - | テーブルモードの更新間隔 | 1000 |

### タスクのキャンセル

```bash
# 特定タスクをキャンセル
bun run dev cancel --task <task-id>

# 全タスクをキャンセル
bun run dev cancel --all
```

### タスク履歴のクリア

```bash
# 完了・キャンセル済みタスクをクリア
bun run dev clear --force
```

---

## 実行フロー

### 基本フロー（Hatなし / `simple`プリセット）

```
開始
  │
  ├─▶ GitHub Issueを取得
  │
  ├─▶ PROMPT.md を生成（.agent/PROMPT.md）
  │
  ├─▶ Scratchpad を初期化（.agent/scratchpad.md）
  │
  ├─▶ [承認ゲート] Pre-Loop: 実行前確認
  │
  ├─▶ ループ開始
  │     │
  │     ├─▶ AIエージェント実行
  │     │
  │     ├─▶ 出力に "LOOP_COMPLETE" があるか確認
  │     │     │
  │     │     ├─ なし → ループ継続
  │     │     │
  │     │     └─ あり → ループ終了
  │     │
  │     └─▶ （最大反復回数に達したら強制終了）
  │
  ├─▶ [承認ゲート] Post-Completion: 完了確認
  │
  └─▶ （--create-pr指定時）PR自動作成
```

### Hatフロー（`tdd`プリセット）

```
開始
  │
  ├─▶ task.start イベント発行
  │
  ├─▶ 🧪 Tester Hat
  │     └─▶ テストを書く → EVENT: tests.failing
  │
  ├─▶ 🔨 Implementer Hat
  │     └─▶ テストを通す実装 → EVENT: code.written
  │
  ├─▶ 🧪 Tester Hat
  │     └─▶ テスト実行 → EVENT: tests.passing
  │
  ├─▶ ✨ Refactorer Hat
  │     └─▶ リファクタリング → EVENT: LOOP_COMPLETE
  │
  └─▶ 完了
```

---

## プリセット

### `simple` - シンプルループ

Hatなしの単純なループ。AIが `LOOP_COMPLETE` を出力するまで反復。

```bash
bun run dev run --issue 42 --preset simple
```

### `tdd` - テスト駆動開発

Red → Green → Refactor のTDDサイクルを強制。

| Hat | トリガー | 出力イベント |
|-----|---------|-------------|
| 🧪 Tester | `task.start`, `code.written` | `tests.failing`, `tests.passing` |
| 🔨 Implementer | `tests.failing` | `code.written` |
| ✨ Refactorer | `tests.passing` | `code.written`, `LOOP_COMPLETE` |

```bash
bun run dev run --issue 42 --preset tdd
```

### `spec-driven` - 仕様駆動開発

計画 → 実装 → レビュー のサイクル。計画後に承認ゲートあり。

| Hat | トリガー | 出力イベント |
|-----|---------|-------------|
| 📋 Planner | `task.start` | `plan.ready` |
| 🔨 Builder | `plan.ready`, `review.revise` | `build.done` |
| 🔍 Reviewer | `build.done` | `review.approved`, `review.revise`, `LOOP_COMPLETE` |

```bash
bun run dev run --issue 42 --preset spec-driven
```

---

## 設定ファイル

`orch.yml` で詳細な設定が可能です。

```yaml
version: "1.0"

# バックエンド設定
backend:
  type: claude                    # claude | opencode | pi
  model: claude-sonnet-4-20250514 # オプション

# ループ設定
loop:
  max_iterations: 100             # 最大反復回数
  completion_promise: "LOOP_COMPLETE"  # 完了キーワード
  idle_timeout_secs: 1800         # アイドルタイムアウト（秒）

# 承認ゲート
gates:
  after_plan: true                # 計画後に承認を要求
  after_implementation: false     # 実装後は自動続行
  before_pr: true                 # PR作成前に承認を要求

# 品質基準（将来の拡張用）
quality:
  min_score: 8                    # 最低品質スコア
  auto_approve_above: 9           # このスコア以上で自動承認

# 状態管理
state:
  use_github_labels: true         # GitHub Issueラベルを使用（v1.3.0+: ステータスラベル自動更新）
  label_prefix: "orch"            # ラベル接頭辞（デフォルト: "orch"）→ orch:running 等
  use_scratchpad: true            # Scratchpadを使用
  scratchpad_path: ".agent/scratchpad.md"

# 改善Issue自動作成（v1.2.0+）
auto_issue:
  enabled: true                   # 改善Issue自動作成を有効化
  min_priority: medium            # 最低優先度（high | medium | low）
  labels:                         # 自動付与するラベル
    - auto-generated
    - improvement
  duplicate_check_enabled: true   # 重複チェックを有効化
  repository: ""                  # 別リポジトリに作成（オプション）

# Issue依存関係管理（v1.3.0+）
dependency:
  resolve: true                   # 依存Issueを自動的に先に実行（--resolve-deps相当）
  ignore: false                   # 依存関係を無視（--ignore-deps相当）

# カスタムHat定義
hats:
  my_custom_hat:
    name: "🎯 My Hat"
    triggers: ["some.event"]
    publishes: ["another.event", "LOOP_COMPLETE"]
    instructions: |
      カスタムの指示をここに書く
```

---

## 生成されるファイル

実行時に以下のファイルが `.agent/` ディレクトリに生成されます。

| ファイル | 説明 |
|---------|------|
| `.agent/PROMPT.md` | AIに渡されるプロンプト |
| `.agent/scratchpad.md` | AIが使用するメモ帳（状態管理） |
| `.agent/events.jsonl` | イベント履歴（Hat切り替え等） |
| `.agent/output_history.txt` | 出力履歴（ループ検出用） |
| `.agent/report.md` | 実行レポート（`--report`指定時） |
| `.agent/report.json` | 実行レポート（JSON形式） |

---

## 実行レポート

`--report` フラグで実行結果の詳細レポートを生成できます。

### 使用方法

```bash
# デフォルトパス（.agent/report.md）に生成
bun run dev run --issue 42 --auto --report

# カスタムパスに生成
bun run dev run --issue 42 --auto --report ./reports/issue-42.md
```

### 出力ファイル

| ファイル | 形式 | 説明 |
|---------|------|------|
| `report.md` | Markdown | 人間が読みやすい形式 |
| `report.json` | JSON | プログラムで処理しやすい形式 |

### レポート内容

- **サマリー**: Issue情報、成功/失敗、所要時間、反復回数
- **タイムライン**: 各イテレーションのHat、所要時間、終了コード、発行イベント
- **イベント履歴**: Hat間で発行されたイベントの時系列
- **PR情報**: 作成されたPRのURL、番号、ブランチ
- **設定**: 使用されたバックエンド、最大反復数、完了キーワード

### レポート例

```markdown
# Orchestration Report

## Summary

| Metric | Value |
|--------|-------|
| Issue | #42: Add user authentication |
| Status | ✅ Completed |
| Duration | 5m 30s |
| Iterations | 8 |

## Timeline

| # | Hat | Duration | Exit | Event |
|---|-----|----------|------|-------|
| 1 | Tester | 45000ms | ✓ | tests.failing |
| 2 | Implementer | 120000ms | ✓ | code.written |
| 3 | Tester | 30000ms | ✓ | tests.passing |
| 4 | Refactorer | 60000ms | ✓ | LOOP_COMPLETE |
```

---

## Issueステータスラベル（v1.3.0+）

GitHub IssueにステータスラベルをつけてIssueの進行状態を可視化できます。

### ステータス一覧

| ステータス | ラベル | 色 | 説明 |
|-----------|--------|-----|------|
| `queued` | `orch:queued` | 🟢 薄緑 | 実行待ち |
| `running` | `orch:running` | 🟢 緑 | 実行中 |
| `completed` | `orch:completed` | 🔵 青 | 正常完了 |
| `failed` | `orch:failed` | 🔴 赤 | 失敗 |
| `blocked` | `orch:blocked` | 🟡 黄 | ブロック中（依存待ち） |
| `pr-created` | `orch:pr-created` | 🟣 紫 | PR作成済み |
| `merged` | `orch:merged` | 🔵 濃青 | マージ完了 |
| `session-active` | `orch:session-active` | ⚪️ 白 | セッション実行中（v3.0.0+） |

---

## セッション管理（v3.0.0+）

セッション管理は、バックエンドプロセス（Claude Code, OpenCode等）の実行を抽象化するレイヤーです。これにより、単なるプロセス実行だけでなく、ターミナルマルチプレクサ（tmux, zellij）内での実行や、バックグラウンド実行を統一的に扱えます。

### 実装の種類

現在、3つの実装をサポートしています：

- **native**: `Bun.spawn` を使用したネイティブ実行。追加の依存関係なし。ログはファイルに出力されます。
- **tmux**: `tmux` を使用してセッション内で実行。対話的な操作や、後からのアタッチが可能です。
- **zellij**: `zellij` を使用してセッション内で実行。

### 自動検出

デフォルトでは、以下の優先順位で利用可能なマネージャーを自動検出します：
1. **tmux** (インストールされており、実行可能な場合)
2. **zellij** (インストールされており、実行可能な場合)
3. **native** (常に利用可能)

### 設定

`orch.yml` でセッション管理の挙動をカスタマイズできます：

```yaml
session:
  type: auto  # auto | native | tmux | zellij
  prefix: orch  # セッション名のプレフィックス
```

### 使用例

セッションタイプを指定して実行する例：

```bash
# 明示的にtmuxを使用して実行
./orch run --issue 123 --session-type tmux

# ネイティブ実行（デフォルトのフォールバック）
./orch run --issue 123 --session-type native
```

---


## トラブルシューティング

### "LOOP_COMPLETE" が出力されない

AIが完了キーワードを出力しないと、最大反復回数に達するまでループが続きます。

**対処法:**
- `--max-iterations` で反復回数を制限
- Issueの説明を明確にする
- プロンプト（`.agent/PROMPT.md`）を確認・調整

### 承認ゲートでスタックする

`--auto` フラグをつけると承認ゲートをスキップできます。

```bash
bun run dev run --issue 42 --auto
```

### GitHub認証エラー

```bash
# GitHub CLIの認証状態を確認
gh auth status

# 再認証
gh auth login
```

### バックエンドが見つからない

```bash
# Claudeの場合
which claude

# OpenCodeの場合
which opencode
```

---

## 開発

### Justfile（推奨）

[just](https://github.com/casey/just) を使用すると、開発コマンドを簡潔に実行できます。

```bash
# justのインストール（macOS）
brew install just

# コマンド一覧を表示
just

# セットアップ（依存関係 + スキーマ生成）
just setup

# テスト実行
just test

# 品質チェック（lint + format + typecheck）
just check

# バイナリビルド
just build

# クロスプラットフォームビルド
just build-all
```

#### 利用可能なコマンド

| コマンド | 説明 |
|---------|------|
| `just setup` | 依存関係インストール + スキーマ生成 |
| `just dev [args]` | 開発モードでCLI実行 |
| `just test` | テスト実行 |
| `just test-watch` | テストをwatchモードで実行 |
| `just check` | lint + format + typecheck |
| `just build` | 現在のプラットフォーム用バイナリ |
| `just build-all` | 全プラットフォームビルド |
| `just clean` | ビルド成果物削除 |
| `just ci` | CI用チェック（test + check） |

### npm scripts

```bash
# JavaScriptにビルド
bun run build

# シングルバイナリにコンパイル（推奨）
bun run build:binary

# クロスプラットフォームビルド
bun run build:binary:linux    # Linux x64
bun run build:binary:macos    # macOS ARM64
bun run build:binary:windows  # Windows x64
```

### テスト

```bash
bun test
# または
just test
```

### 型チェック

```bash
bun run typecheck
# または
just typecheck
```

### Lint & Format

```bash
bun run lint
bun run format
# または
just check
```

### グローバルインストール

```bash
# バイナリをビルドしてパスの通った場所に配置
just build
sudo mv orch /usr/local/bin/

# これで `orch` コマンドが使えるようになる
orch run --issue 42
```

---

## アーキテクチャ

```
src/
├── cli.ts              # CLIエントリーポイント
├── cli-logs.ts         # logsコマンドヘルパー（v1.2.0+）
├── index.ts            # ライブラリエクスポート
├── core/
│   ├── loop.ts         # メインループエンジン
│   ├── event.ts        # イベントバス（Hat間通信）
│   ├── hat.ts          # Hatシステム
│   ├── config.ts       # 設定読み込み
│   ├── scratchpad.ts   # Scratchpad管理
│   ├── logger.ts       # ロガー
│   ├── task-manager.ts # 並列タスク管理
│   ├── exec.ts         # Bun.spawn ラッパー
│   ├── errors.ts       # エラークラス階層（v1.2.0+）
│   ├── log-writer.ts   # ログファイル書き込み（v1.2.0+）
│   ├── log-streamer.ts # ログリアルタイム読み取り（v1.2.0+）
│   ├── bun-process-executor.ts  # プロセス実行抽象化（v1.2.0+）
│   └── types.ts        # 型定義
├── adapters/
│   ├── base.ts         # バックエンド抽象基底
│   ├── claude.ts       # Claude Code アダプター
│   ├── opencode.ts     # OpenCode アダプター
│   └── session/              # セッション管理（v3.0.0+）
│       ├── interface.ts      # ISessionManager インターフェース
│       ├── native.ts         # Native実装（Bun.spawn + ファイルログ）
│       ├── tmux.ts           # Tmux実装
│       ├── zellij.ts         # Zellij実装
│       └── factory.ts        # ファクトリー（自動検出）
├── input/
│   ├── github.ts       # GitHub Issue取得
│   └── prompt.ts       # プロンプト生成
├── gates/
│   └── approval.ts     # 承認ゲート
├── output/
│   ├── pr.ts           # PR作成
│   ├── report.ts       # 実行レポート生成
│   ├── issue-generator.ts    # 改善Issue自動作成（v1.2.0+）
│   └── issue-status-label-manager.ts  # Issueステータスラベル管理（v1.3.0+）
├── worktree/               # 並列実行環境管理（v2.0.0+）
│   ├── worktree-manager.ts           # Git worktree管理
│   ├── hybrid-environment-builder.ts # Worktree + Container統合
│   ├── environment-state-manager.ts  # 環境状態管理（GitHub Issue連携）
│   └── auto-cleanup-service.ts       # PRマージ後の自動クリーンアップ
├── utils/
│   └── improvement-extractor.ts  # 改善点抽出（v1.2.0+）
└── schemas/
    └── orch.schema.json  # JSON Schema（自動生成、v1.2.0+）
```

---

## ライセンス

MIT
