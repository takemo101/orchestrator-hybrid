# Orchestrator Hybrid - 設計ドキュメント

## 概要

Ralph OrchestratorとComposer Workflowの良いとこ取りをした新しいAIエージェントオーケストレーター。

## 両者の分析

### Ralph Orchestrator の強み

| 機能 | 詳細 |
|------|------|
| **ループ実行** | 完了まで自動的に反復実行 |
| **Hatシステム** | 役割ベースのイベント駆動協調 |
| **Scratchpad** | シンプルな状態管理（1ファイル） |
| **バックプレッシャー** | 品質ゲートによる成果物拒否 |
| **プリセット** | 20+の定義済みワークフロー |
| **マルチバックエンド** | Claude, Gemini, Codex等に対応 |

### Ralph Orchestrator の弱み

| 課題 | 詳細 |
|------|------|
| **Issue統合なし** | GitHub Issue駆動ではない |
| **承認ゲートなし** | 人間の介入ポイントが不明確 |
| **環境分離なし** | container-use的な隔離環境がない |
| **Rust実装** | 拡張・カスタマイズが困難 |

### Composer Workflow の強み

| 機能 | 詳細 |
|------|------|
| **Issue駆動** | GitHub Issueから直接実装開始 |
| **Phase管理** | 明確なフェーズ遷移（13段階） |
| **承認ゲート** | 人間の介入ポイントが明確 |
| **container-use** | 隔離環境での安全な実行 |
| **TDD強制** | テスト駆動開発の組み込み |
| **レビューループ** | 品質スコアによる反復改善 |

### Composer Workflow の弱み

| 課題 | 詳細 |
|------|------|
| **自動ループなし** | 各ステップで手動介入が必要 |
| **複雑な状態管理** | ラベル体系が複雑 |
| **固定ワークフロー** | 柔軟なカスタマイズが困難 |
| **単一バックエンド** | OpenCode/Claude Code前提 |

---

## 統合アーキテクチャ

### コンセプト: "Guided Autonomous Loop"

```
┌─────────────────────────────────────────────────────────────┐
│                    Orchestrator Hybrid                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │  Input   │───▶│  Loop    │───▶│  Output  │             │
│  │  Layer   │    │  Engine  │    │  Layer   │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│       │              │  ▲            │                     │
│       ▼              ▼  │            ▼                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐             │
│  │  GitHub  │    │   Hat    │    │   PR     │             │
│  │  Issue   │    │  System  │    │ Creation │             │
│  └──────────┘    └──────────┘    └──────────┘             │
│                      │                                     │
│                      ▼                                     │
│               ┌──────────────┐                             │
│               │  Approval    │                             │
│               │    Gates     │                             │
│               └──────────────┘                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 主要コンポーネント

#### 1. Input Layer
- GitHub Issue からのタスク取得
- PROMPT.md 形式への変換
- 既存の設計書/仕様書の参照

#### 2. Loop Engine (Ralph由来)
- 完了条件まで自動反復
- 設定可能な最大反復回数
- ループ検出（類似出力の検知）

#### 3. Hat System (Ralph由来 + 拡張)
- 事前定義の役割（Planner, Builder, Tester, Reviewer）
- イベント駆動の役割切り替え
- カスタムHat定義可能

#### 4. Approval Gates (Composer由来)
- フェーズ遷移時の人間による承認
- `--auto` フラグで自動承認モード
- 品質スコアによる自動判定オプション

#### 5. State Management
- GitHub Issue ラベル（環境横断アクセス）
- ローカルScratchpad（高速アクセス）
- 両者のハイブリッド

#### 6. Output Layer
- PR自動作成
- Issue更新（ラベル、コメント）
- 実行レポート生成

---

## 実装フェーズ

### Phase 1: 最小プロトタイプ (Shell)
**目標**: 基本ループの動作確認

```bash
./orch run --issue 123
# → Issue取得 → PROMPT生成 → claude実行 → 完了判定 → 反復
```

成果物:
- `orch.sh` - メインスクリプト
- `config.yml` - 設定ファイル
- 基本的なループ実行

### Phase 2: TypeScript Core
**目標**: 型安全なコア実装

成果物:
- `src/core/loop.ts` - ループエンジン
- `src/core/hat.ts` - Hatシステム
- `src/adapters/` - バックエンド抽象化
- `src/input/github.ts` - Issue取得

### Phase 3: Approval Gates
**目標**: 人間介入ポイントの実装

成果物:
- `src/gates/approval.ts` - 承認ゲート
- `src/gates/quality.ts` - 品質スコア判定
- Interactive CLI プロンプト

### Phase 4: Full Integration
**目標**: 完全なワークフロー

成果物:
- container-use統合
- PR自動作成
- レポート生成
- プリセットライブラリ

---

## ディレクトリ構造

```
orchestrator-hybrid/
├── bin/
│   └── orch                    # CLI エントリーポイント
├── src/
│   ├── core/
│   │   ├── loop.ts             # ループエンジン
│   │   ├── hat.ts              # Hatシステム
│   │   ├── state.ts            # 状態管理
│   │   └── config.ts           # 設定読み込み
│   ├── adapters/
│   │   ├── claude.ts           # Claude Code
│   │   ├── opencode.ts         # OpenCode
│   │   └── base.ts             # 抽象基底
│   ├── input/
│   │   ├── github.ts           # GitHub Issue取得
│   │   ├── prompt.ts           # PROMPT.md生成
│   │   └── spec.ts             # 設計書参照
│   ├── gates/
│   │   ├── approval.ts         # 承認ゲート
│   │   └── quality.ts          # 品質判定
│   └── output/
│       ├── pr.ts               # PR作成
│       └── report.ts           # レポート生成
├── presets/
│   ├── tdd.yml                 # TDDワークフロー
│   ├── spec-driven.yml         # 仕様駆動
│   └── review.yml              # レビューフロー
├── scripts/
│   └── orch.sh                 # Phase 1 プロトタイプ
├── package.json
├── tsconfig.json
└── README.md
```

---

## CLI インターフェース

```bash
# 基本実行
orch run --issue 123

# オプション
orch run --issue 123 \
  --backend claude \           # バックエンド指定
  --preset tdd \               # プリセット使用
  --max-iterations 50 \        # 最大反復回数
  --auto                       # 自動承認モード

# Hat指定実行
orch run --issue 123 --hat reviewer

# プロンプト直接指定
orch run -p "Add input validation"

# 状態確認
orch status --issue 123

# ループ中断
orch cancel --issue 123
```

---

## 設定ファイル

```yaml
# orch.yml
version: "1.0"

# バックエンド設定
backend:
  type: claude                  # claude | opencode | gemini
  model: claude-sonnet-4-20250514

# ループ設定
loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"
  idle_timeout_secs: 1800

# Hat定義
hats:
  planner:
    triggers: ["task.start"]
    publishes: ["plan.ready"]
    instructions: |
      Analyze the issue and create implementation plan.

  builder:
    triggers: ["plan.ready", "tests.failing"]
    publishes: ["code.written"]
    instructions: |
      Implement the code based on the plan.
      Write minimal code to pass tests.

  tester:
    triggers: ["code.written"]
    publishes: ["tests.passing", "tests.failing"]
    instructions: |
      Run tests. Report results.

  reviewer:
    triggers: ["tests.passing"]
    publishes: ["review.approved", "review.rejected"]
    instructions: |
      Review code quality. Check for issues.

# 承認ゲート
gates:
  after_plan: true              # 計画後に承認
  after_implementation: false   # 実装後は自動
  before_pr: true               # PR前に承認

# 品質基準
quality:
  min_score: 8                  # 最低スコア
  auto_approve_above: 9         # このスコア以上で自動承認

# 状態管理
state:
  use_github_labels: true       # GitHub Issue ラベル使用
  use_scratchpad: true          # ローカルScratchpad使用
  scratchpad_path: ".agent/scratchpad.md"
```

---

## 次のアクション

1. **Phase 1 開始**: `scripts/orch.sh` の実装
2. 基本ループの動作確認
3. Issue取得 → PROMPT生成 → 実行 の流れを検証
