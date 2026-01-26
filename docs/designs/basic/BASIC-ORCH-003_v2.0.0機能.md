# orchestrator-hybrid v2.0.0機能 基本設計書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | BASIC-ORCH-003 |
| バージョン | 1.0.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-26 |
| 最終更新日 | 2026-01-26 |
| 作成者 | AI Assistant |
| 承認者 | - |
| 関連要件定義書 | REQ-ORCH-002 v1.0.0 |
| 関連基本設計書 | BASIC-ORCH-001 v1.0.0 (Phase 1-2), BASIC-ORCH-002 v1.0.0 (Phase 3) |

---

## 1. 概要

### 1.1 目的

orchestrator-hybrid v2.0.0として、以下の機能を追加し、ユーザー体験と並列実行の安定性を向上させる：

1. **run設定デフォルト化（F-101）**: `orch.yml`で`--auto`, `--create-pr`等をデフォルト設定可能に
2. **CLIリファクタリング（F-102）**: `cli.ts`を`commands/`に分離、保守性向上
3. **バックエンド出力ストリーミング（F-103）**: AIエージェント出力をリアルタイムで`backend.log`に書き込み
4. **logsコマンド拡張（F-104）**: `--source backend`でAIエージェント出力を監視
5. **WorktreeManager（F-201）**: git worktreeの作成/削除/一覧管理
6. **Worktree + Container-Use統合（F-202）**: ハイブリッド環境の自動構築
7. **環境状態管理（F-203）**: GitHub Issueラベル/メタデータで環境状態を追跡
8. **自動クリーンアップ（F-204）**: マージ後にworktree + container-use環境を削除

### 1.2 背景

v1.4.0までの実装状況：

- **v1.2.0**: Docker/Host/Container-use sandbox対応、JSON Schema、改善Issue自動作成
- **v1.3.0**: PR自動マージ、リアルタイムログ監視、Issue依存関係管理、Issueステータスラベル
- **v1.4.0**: Per-Hat Model Selection、Memories System、Tasks System、Session Recording、Multi-Loop Concurrency、Per-Hat Backend、Custom Backends、Event Emission CLI、Glob Pattern Event Matching

しかし、以下の課題が残っている：

- `--auto --create-pr`等を毎回指定する必要がある
- `cli.ts`が1000行を超え、保守性が低下
- AIエージェントの出力がリアルタイムで確認できない
- container-use単体ではファイルシステムが共有され、ブランチ競合が発生

### 1.3 スコープ

#### スコープ内

- **Phase 1: 基盤改善（優先度: 高）**
  - run設定デフォルト化（F-101）
  - CLIリファクタリング（F-102）
  - バックエンド出力ストリーミング（F-103）
  - logsコマンド拡張（F-104）

- **Phase 2: 並列実行環境（優先度: 高）**
  - WorktreeManager実装（F-201）
  - Worktree + Container-Use統合（F-202）
  - 環境状態管理（F-203）
  - 自動クリーンアップ（F-204）

#### スコープ外

- v1.4.0で実装済みの機能の大幅な変更
- UI/GUIの実装
- 他のバージョン管理システム（Git以外）への対応

### 1.4 用語定義

| 用語 | 定義 |
|------|------|
| worktree | git worktree機能。同一リポジトリの複数ブランチを別ディレクトリで管理 |
| ハイブリッド環境 | worktree（ファイルシステム分離）+ container-use（環境分離）の組み合わせ |
| ストリーミング | データを逐次的に処理・転送する方式 |
| config-merger | CLI/設定ファイル/デフォルト値を統合するロジック |
| バックエンド出力 | AIエージェント（claude/opencode）の標準出力/標準エラー出力 |

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Hybrid v2.0.0                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │  Input   │───▶│  Loop    │───▶│  Output  │                  │
│  │  Layer   │    │  Engine  │    │  Layer   │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│       │              │  ▲            │                          │
│       ▼              ▼  │            ▼                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │  GitHub  │    │   Hat    │    │   PR     │                  │
│  │  Issue   │    │  System  │    │ Creation │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│                      │                │                         │
│                      │                ▼                         │
│                      │         ┌──────────────┐                 │
│                      │         │ PRAutoMerger │ (v1.3.0)        │
│                      │         └──────────────┘                 │
│                      │                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          CLI Layer (Phase 1: リファクタリング)            │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   cli.ts     │  │   commands/  │  │   config-    │   │   │
│  │  │ (エントリー) │  │   run.ts     │  │   merger.ts  │   │   │
│  │  │              │  │   init.ts    │  │   (新規)     │   │   │
│  │  │              │  │   logs.ts    │  │              │   │   │
│  │  │              │  │   status.ts  │  │              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Logging System (Phase 1: 拡張)                  │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │     Log      │  │     Log      │  │   Backend    │   │   │
│  │  │   Writer     │  │  Streamer    │  │   Output     │   │   │
│  │  │  (v1.2.0)    │  │  (v1.3.0)    │  │  Streaming   │   │   │
│  │  │              │  │              │  │   (新規)     │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                           │                 │           │   │
│  │                           ▼                 ▼           │   │
│  │                    .agent/<task-id>/                    │   │
│  │                    ├── task.log                         │   │
│  │                    ├── backend.log  ← 新規              │   │
│  │                    └── events.jsonl                     │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Worktree Management (Phase 2: 新規)             │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │  Worktree    │  │   Hybrid     │  │   State      │   │   │
│  │  │  Manager     │  │  Environment │  │  Manager     │   │   │
│  │  │              │  │  Builder     │  │              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │         │                 │                 │           │   │
│  │         ▼                 ▼                 ▼           │   │
│  │  .worktrees/       container-use      GitHub Issue     │   │
│  │  ├── issue-42/     environment         Labels/         │   │
│  │  ├── issue-43/                         Metadata        │   │
│  │  └── ...                                                │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Configuration Management (Phase 1: 拡張)        │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │    YAML      │  │     Zod      │  │   Config     │   │   │
│  │  │   Parser     │  │  Validator   │  │   Merger     │   │   │
│  │  │   (既存)     │  │   (既存)     │  │   (新規)     │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │         │                 │                 │           │   │
│  │         ▼                 ▼                 ▼           │   │
│  │    orch.yml          Validation       CLI Options       │   │
│  │    run:                                                 │   │
│  │      auto_mode: true                                    │   │
│  │      create_pr: true                                    │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技術スタック

| レイヤー | 技術 | バージョン | 備考 |
|---------|------|-----------|------|
| **ランタイム** | Bun | 1.0以上 | 既存 |
| **言語** | TypeScript | 5.0以上 | strict mode |
| **スキーマ検証** | zod | ^3.23.0 | 既存 |
| **YAML解析** | yaml | ^2.4.0 | 既存 |
| **git** | git | 2.5以上 | worktree機能の要件 |
| **container-use** | cu CLI | 最新 | 環境分離 |
| **CI/CD** | GitHub Actions | - | PR自動マージ |
| **テスト** | bun test | - | 既存 |
| **Lint/Format** | Biome | ^2.3.11 | 既存 |

#### 技術選定理由

| 技術 | 選定理由 |
|------|---------|
| git worktree | 同一リポジトリの複数ブランチを別ディレクトリで管理。ファイルシステムレベルで完全分離 |
| container-use | 既存プロジェクトで使用中。環境分離機能を提供 |
| zod | 既存プロジェクトで使用中。実行時型検証とTypeScript型定義の統合 |

### 2.3 外部システム連携

```
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator Hybrid v2.0.0                  │
└─────────────────────────────────────────────────────────────┘
                     │                    │
                     ▼                    ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   git CLI        │  │   GitHub API     │
         │   (F-201)        │  │   (F-203)        │
         └──────────────────┘  └──────────────────┘
                 │                      │
                 ▼                      ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  git worktree    │  │   gh CLI         │
         │  - add           │  │   - issue edit   │
         │  - remove        │  │   - api          │
         │  - list          │  │                  │
         └──────────────────┘  └──────────────────┘
```

---

## 3. 機能一覧

### 3.1 Phase 1: 基盤改善（優先度: 高）

| ID | 機能名 | 概要 | 優先度 | 実装モジュール |
|----|--------|------|--------|---------------|
| F-101 | run設定デフォルト化 | `orch.yml`で`--auto`, `--create-pr`等をデフォルト設定可能に | 必須 | ConfigMerger |
| F-102 | CLIリファクタリング | `cli.ts`を`commands/`に分離、保守性向上 | 必須 | src/cli/commands/ |
| F-103 | バックエンド出力ストリーミング | AIエージェント出力をリアルタイムで`backend.log`に書き込み | 必須 | BackendOutputStreamer |
| F-104 | logsコマンド拡張 | `--source backend`でAIエージェント出力を監視 | 必須 | src/cli/commands/logs.ts |

### 3.2 Phase 2: 並列実行環境（優先度: 高）

| ID | 機能名 | 概要 | 優先度 | 実装モジュール |
|----|--------|------|--------|---------------|
| F-201 | WorktreeManager | git worktreeの作成/削除/一覧管理 | 必須 | WorktreeManager |
| F-202 | Worktree + Container-Use統合 | ハイブリッド環境の自動構築 | 必須 | HybridEnvironmentBuilder |
| F-203 | 環境状態管理 | GitHub Issueラベル/メタデータで環境状態を追跡 | 必須 | EnvironmentStateManager |
| F-204 | 自動クリーンアップ | マージ後にworktree + 実行環境を削除 | 必須 | AutoCleanupService |

### 3.3 環境組み合わせパターン

worktree、container-use、Docker sandboxは独立して有効/無効を切り替え可能です。

| パターン | worktree | sandbox | 動作 | ユースケース |
|---------|----------|---------|------|-------------|
| **A: ハイブリッド** | ✅ enabled | container-use | worktree + container-use環境 | 最も安全な並列実行 |
| **B: worktree + Docker** | ✅ enabled | docker | worktree + Dockerコンテナ | container-useが使えない環境 |
| **C: worktreeのみ** | ✅ enabled | host または disabled | worktreeのみ（ホスト実行） | 軽量な並列実行 |
| **D: container-useのみ** | ❌ disabled | container-use | container-use環境のみ | 既存のv1.x互換 |
| **E: Dockerのみ** | ❌ disabled | docker | Dockerコンテナのみ | 既存のv1.x互換 |
| **F: ホスト実行** | ❌ disabled | host または disabled | ホスト環境で直接実行 | 最小構成 |

#### 設定例

**パターンC: worktreeのみ（Docker/container-use なし）**

```yaml
worktree:
  enabled: true
  base_dir: ".worktrees"
  auto_cleanup: true

container:
  enabled: false  # container-useを使用しない

sandbox:
  type: host      # ホスト環境で直接実行
```

この場合の動作フロー：
1. `.worktrees/issue-42/` にworktreeを作成
2. worktree内でホスト環境として直接AIエージェントが作業
3. マージ後にworktreeとブランチを削除

**パターンB: worktree + Docker**

```yaml
worktree:
  enabled: true
  base_dir: ".worktrees"
  auto_cleanup: true

container:
  enabled: false  # container-useは使用しない

sandbox:
  type: docker
  docker:
    image: node:20-alpine
    network: none
```

### 3.4 自動クリーンアップ対象（F-204詳細）

マージ後に自動削除される対象は、使用している環境によって異なります。

| 環境 | 削除対象 | 削除コマンド |
|------|---------|-------------|
| **worktree** | `.worktrees/issue-<番号>/` ディレクトリ | `git worktree remove` |
| **worktree** | `feature/issue-<番号>` ブランチ | `git branch -d` |
| **container-use** | container-use環境 | `cu env delete <env-id>` |
| **Docker** | Dockerコンテナ | `docker rm <container-id>` |
| **Docker** | 一時ボリューム（使用時） | `docker volume rm` |

#### ビジネスルール

- **BR-215**: Docker sandbox使用時、マージ後にコンテナを自動削除
- **BR-216**: worktreeのみ使用時（sandbox無効）、worktreeとブランチのみ削除
- **BR-217**: 環境タイプに応じて適切なクリーンアップ処理を選択

---

## 4. 画面一覧（CLIコマンド）

| ID | コマンド | 概要 | 新規/既存 |
|----|---------|------|----------|
| S-101 | `orch run` | タスク実行（設定ファイルのデフォルト値を使用） | 既存（拡張） |
| S-102 | `orch logs --source backend` | バックエンド出力を監視 | 既存（拡張） |
| S-103 | `orch init` | 設定ファイル初期化 | 既存 |
| S-104 | `orch status` | タスク状態確認 | 既存 |

---

## 5. API一覧（内部API・クラス定義）

### 5.1 Phase 1: 基盤改善

| クラス/関数 | 責務 | 新規/既存 |
|-----------|------|----------|
| **ConfigMerger** | CLI/設定ファイル/デフォルト値を統合 | 新規 |
| **BackendOutputStreamer** | バックエンド出力をリアルタイムで`backend.log`に書き込み | 新規 |
| **src/cli/commands/run.ts** | runコマンドの実装 | 新規 |
| **src/cli/commands/init.ts** | initコマンドの実装 | 新規 |
| **src/cli/commands/logs.ts** | logsコマンドの実装（拡張） | 新規 |
| **src/cli/commands/status.ts** | statusコマンドの実装 | 新規 |

### 5.2 Phase 2: 並列実行環境

| クラス/関数 | 責務 | 新規/既存 |
|-----------|------|----------|
| **WorktreeManager** | git worktreeの作成/削除/一覧管理 | 新規 |
| **HybridEnvironmentBuilder** | worktree + container-use環境の構築 | 新規 |
| **EnvironmentStateManager** | GitHub Issueラベル/メタデータで環境状態を追跡 | 新規 |
| **AutoCleanupService** | マージ後にworktree + container-use環境を削除 | 新規 |

---

## 6. データモデル概要

### 6.1 設定ファイル構造（orch.yml拡張）

```yaml
version: "1.0"

# バックエンド設定（既存）
backend:
  type: claude
  model: claude-sonnet-4-20250514

# run設定（新規 Phase 1）
run:
  auto_mode: true       # --auto のデフォルト
  create_pr: true       # --create-pr のデフォルト
  draft_pr: false       # --draft のデフォルト

# worktree設定（新規 Phase 2）
worktree:
  enabled: true         # false にするとworktreeを使用しない
  base_dir: ".worktrees"
  auto_cleanup: true
  copy_env_files:
    - ".env"
    - ".envrc"
    - ".env.local"

# container-use設定（既存、拡張）
container:
  enabled: true         # false にするとcontainer-useを使用しない
  image: node:20

# sandbox設定（v1.2.0、worktree併用時も有効）
sandbox:
  type: docker          # docker | container-use | host
  fallback: host        # プライマリ環境が使えない場合のフォールバック
  docker:
    image: node:20-alpine
    network: none
    timeout: 300

# ループ設定（既存）
loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"
  idle_timeout_secs: 1800

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
```

### 6.2 worktrees.json（新規）

```json
{
  "worktrees": [
    {
      "issueNumber": 42,
      "path": ".worktrees/issue-42",
      "branch": "feature/issue-42",
      "environmentType": "container-use",
      "environmentId": "abc-123",
      "createdAt": "2026-01-26T10:00:00Z",
      "status": "active"
    },
    {
      "issueNumber": 43,
      "path": ".worktrees/issue-43",
      "branch": "feature/issue-43",
      "environmentType": "docker",
      "environmentId": "container-xyz",
      "createdAt": "2026-01-26T11:00:00Z",
      "status": "active"
    },
    {
      "issueNumber": 44,
      "path": ".worktrees/issue-44",
      "branch": "feature/issue-44",
      "environmentType": "host",
      "environmentId": null,
      "createdAt": "2026-01-26T12:00:00Z",
      "status": "active"
    }
  ]
}
```

**フィールド説明:**

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `environmentType` | `"container-use" \| "docker" \| "host"` | 使用している実行環境の種類 |
| `environmentId` | `string \| null` | 環境ID（hostの場合はnull） |

### 6.3 ログディレクトリ構成（拡張）

```
.agent/
├── task-1234567890-42/
│   ├── task.log           # orchestrator-hybridのログ（既存）
│   ├── backend.log        # バックエンド出力（新規 Phase 1）
│   └── events.jsonl       # イベント履歴
```

---

## 7. 技術スタック

| レイヤー | 技術 | 備考 |
|---------|------|------|
| ランタイム | Bun 1.0以上 | 既存 |
| 言語 | TypeScript 5.0+ | strict mode |
| スキーマ検証 | zod | 既存 |
| YAML解析 | yaml | 既存 |
| git | 2.5以上 | worktree機能 |
| container-use | CLI環境分離 | 既存 |
| CI/CD | GitHub Actions | 既存 |
| テスト | Bun test | 既存 |
| コードフォーマット | Biome | 既存 |

---

## 8. 非機能要件

### 8.1 性能要件

| ID | 要件 | 目標値 | 測定方法 |
|----|------|--------|----------|
| NFR-P-007 | 設定ファイル読み込み時間 | 50ms以内 | ユニットテスト |
| NFR-P-008 | バックエンド出力の遅延 | 500ms以内 | 統合テスト |
| NFR-P-009 | worktree作成時間 | 5秒以内 | 統合テスト |
| NFR-P-010 | container-use環境作成時間 | 30秒以内 | 統合テスト |

### 8.2 セキュリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-S-007 | 環境ファイルの保護 | `.env`等の機密情報をworktreeにコピー時、パーミッション維持 |
| NFR-S-008 | ログファイルの保護 | `backend.log`に機密情報が含まれる可能性を警告 |

### 8.3 保守性要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-M-104 | コードの可読性 | 各コマンドファイルは200行以下 |
| NFR-M-105 | テストカバレッジ | 新規コードは80%以上 |
| NFR-M-106 | ドキュメント | 各機能にREADME更新 |

---

## 9. 制約事項・前提条件

### 9.1 技術的制約

| 制約 | 詳細 | 理由 |
|------|------|------|
| Bun 1.0以上 | ランタイム | 既存プロジェクトの依存 |
| git 2.5以上 | worktree機能 | worktree機能の要件 |
| container-use CLI | 環境分離 | 既存機能の依存 |

### 9.2 ビジネス制約

| 制約 | 詳細 |
|------|------|
| 後方互換性 | 既存のCLIインターフェースを変更しない |
| 段階的リリース | Phase 1 → Phase 2の順で実装 |

---

## 10. リスクと対策

### 10.1 リスク一覧

| ID | リスク | 影響度 | 発生確率 | 対策 |
|----|--------|--------|---------|------|
| R-010 | CLIリファクタリングでバグ混入 | 高 | 中 | 既存テストの維持、段階的リファクタリング |
| R-011 | worktree + container-use統合の複雑性 | 中 | 高 | プロトタイプ実装、十分なテスト |
| R-012 | バックエンド出力のログサイズ肥大化 | 中 | 中 | ローテーション機能、サイズ上限設定 |

### 10.2 未解決課題

| ID | 課題 | 担当 | 期限 |
|----|------|------|------|
| I-101 | worktree削除時のコンフリクト処理 | - | Phase 2実装前 |
| I-102 | 複数worktreeの同時マージ順序 | - | Phase 2実装前 |

---

## 11. 詳細設計書一覧

| # | 機能名 | パス | ステータス |
|---|--------|------|-----------|
| 1 | run設定デフォルト化 | docs/designs/detailed/v2.0.0機能/run-config-defaults/ | 未作成 |
| 2 | CLIリファクタリング | docs/designs/detailed/v2.0.0機能/cli-refactoring/ | 未作成 |
| 3 | バックエンド出力ストリーミング | docs/designs/detailed/v2.0.0機能/backend-output-streaming/ | 未作成 |
| 4 | logsコマンド拡張 | docs/designs/detailed/v2.0.0機能/logs-command-extension/ | 未作成 |
| 5 | WorktreeManager | docs/designs/detailed/v2.0.0機能/worktree-manager/ | 未作成 |
| 6 | Worktree + Container-Use統合 | docs/designs/detailed/v2.0.0機能/hybrid-environment/ | 未作成 |
| 7 | 環境状態管理 | docs/designs/detailed/v2.0.0機能/environment-state/ | 未作成 |
| 8 | 自動クリーンアップ | docs/designs/detailed/v2.0.0機能/auto-cleanup/ | 未作成 |
| 9 | 共通（型定義・エラークラス） | docs/designs/detailed/v2.0.0機能/共通/ | 未作成 |

---

## 12. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-26 | 初版作成 | AI Assistant |
| 1.0.1 | 2026-01-26 | 環境組み合わせパターン追加、Docker自動クリーンアップ追加 | AI Assistant |

---

## 13. v1.4.0との関連性

v2.0.0は、v1.4.0の追加仕様に対して以下の改善を行う：

| v1.4.0機能 | v2.0.0改善 |
|-----------|-----------|
| Per-Hat Model Selection（F-013） | 設定ファイルでデフォルト化（F-101） |
| Multi-Loop Concurrency（F-017） | worktree + container-useハイブリッド環境で完全分離（F-201, F-202） |
| Session Recording（F-016） | バックエンド出力のリアルタイムストリーミング（F-103） |
| Memories System（F-014） | 変更なし（既存機能を継承） |
| Tasks System（F-015） | 変更なし（既存機能を継承） |

v2.0.0は、v1.4.0の機能を基盤として、**ユーザー体験の向上**と**並列実行の安定性向上**に焦点を当てた改善を行う。
