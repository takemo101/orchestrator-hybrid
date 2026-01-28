# orchestrator-hybrid シンプル化提案仕様書 (v3.0.0)

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | PROPOSAL-SIMPLIFY-001 |
| バージョン | 1.0.0 |
| ステータス | 提案 |
| 作成日 | 2026-01-28 |
| 作成者 | AI Assistant |

---

## 1. 現状分析

### 1.1 現在のコードベース規模

| カテゴリ | ファイル数 | 複雑度評価 |
|---------|-----------|----------|
| **core/** | 30+ | 高 |
| **adapters/** | 10 | 中 |
| **cli/commands/** | 12 | 低 |
| **worktree/** | 5 | 中 |
| **output/** | 6 | 中 |
| **input/** | 4 | 低 |
| **テスト** | 40+ | - |
| **ドキュメント** | 91 | 過剰 |

### 1.2 機能の肥大化

```
v1.0.0: 基本ループ（Issue → AI → PR）
v1.2.0: +Docker/Container-use, +JSON Schema, +Issue自動作成
v1.3.0: +PR自動マージ, +ログ監視, +Issue依存関係, +ステータスラベル
v1.4.0: +Hat別モデル, +Memories, +Tasks, +Session Recording, +Multi-Loop, +Custom Backends, +Event Emission, +Glob Matching
v2.0.0: +Worktree + Container-Use統合, +環境状態管理, +自動クリーンアップ
```

**問題点**:
- 機能が積み重なり、コアの目的がぼやけている
- 91個のドキュメントファイルは明らかに過剰
- 使用頻度の低い機能が多い（Memories, Tasks, Session Recording等）

### 1.3 削除候補機能

| 機能 | 使用頻度 | 削除推奨度 | 理由 |
|------|---------|----------|------|
| **Memories System (F-014)** | 低 | ★★★ | AIエージェント自体がコンテキストを持つ。外部永続化は不要 |
| **Tasks System (F-015)** | 低 | ★★★ | GitHub Issueで十分。重複機能 |
| **Session Recording (F-016)** | 低 | ★★☆ | デバッグ用途のみ。必要時に追加可能 |
| **Multi-Loop Concurrency (F-017)** | 中 | ★☆☆ | Worktreeで代替済み |
| **Custom Backends (F-019)** | 低 | ★★☆ | 使用ケースが限定的 |
| **Event Emission CLI (F-020)** | 低 | ★★★ | Hatシステムで自動処理されるため不要 |
| **Glob Pattern Matching (F-021)** | 低 | ★★☆ | 完全一致で十分 |
| **Per-Hat Model Selection (F-013)** | 中 | ★☆☆ | シンプルだが使用頻度は低い |
| **Per-Hat Backend (F-018)** | 低 | ★★☆ | 複雑すぎる。1つのバックエンドで十分 |

---

## 2. シンプル化方針

### 2.1 コアコンセプトへの回帰

**本質**: GitHub Issue → AIエージェント自動実行 → PR作成

```
┌─────────────────────────────────────────────────────────────┐
│                  orchestrator-hybrid v3.0.0                  │
│                     "Back to Basics"                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. GitHub Issue取得                                        │
│      ↓                                                       │
│   2. プロンプト生成                                          │
│      ↓                                                       │
│   3. AIエージェント実行（LOOP_COMPLETE まで反復）             │
│      ↓                                                       │
│   4. PR作成                                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 推奨アーキテクチャ

```
src/
├── cli.ts                    # エントリーポイント（50行以下）
├── core/
│   ├── loop.ts               # メインループエンジン（200行以下）
│   ├── config.ts             # 設定読み込み
│   ├── types.ts              # 型定義（シンプル化）
│   ├── event.ts              # イベントバス（シンプル化）
│   └── hat.ts                # Hatシステム（オプション）
├── adapters/
│   ├── base.ts               # バックエンド基底クラス
│   ├── claude.ts             # Claude アダプター
│   └── opencode.ts           # OpenCode アダプター
├── input/
│   ├── github.ts             # Issue取得
│   └── prompt.ts             # プロンプト生成
└── output/
    └── pr.ts                 # PR作成
```

**削減**: 100+ ファイル → 15 ファイル

---

## 3. v3.0.0 推奨仕様

### 3.1 機能一覧（Tier分類）

#### Tier 1: コア機能（必須）

| 機能 | 説明 | 現在 | v3.0.0 |
|------|------|------|--------|
| Issue取得 | GitHub Issueからタスク内容を取得 | ✅ | ✅ |
| プロンプト生成 | Issue内容からプロンプトを自動生成 | ✅ | ✅ |
| ループ実行 | `LOOP_COMPLETE`まで反復 | ✅ | ✅ |
| PR作成 | 完了後にPRを自動作成 | ✅ | ✅ |
| 承認ゲート | 重要ポイントで人間の承認を要求 | ✅ | ✅ |

#### Tier 2: 推奨機能（オプション）

| 機能 | 説明 | 現在 | v3.0.0 |
|------|------|------|--------|
| Hatシステム | 役割ベースのプロンプト切り替え | ✅ | ✅（簡略化） |
| プリセット | 定義済み設定（simple/tdd） | ✅ | ✅ |
| ログ監視 | `orch logs --follow` | ✅ | ✅ |
| ステータスラベル | GitHub Issueにステータス表示 | ✅ | ✅ |

#### Tier 3: 削除推奨

| 機能 | 現在 | v3.0.0 | 削除理由 |
|------|------|--------|---------|
| Memories System | ✅ | ❌ | AIコンテキストで代替 |
| Tasks System | ✅ | ❌ | GitHub Issueで代替 |
| Session Recording | ✅ | ❌ | 使用頻度低 |
| Multi-Loop Concurrency | ✅ | ❌ | Worktreeで代替 |
| Custom Backends | ✅ | ❌ | 使用ケース限定 |
| Event Emission CLI | ✅ | ❌ | 内部処理で十分 |
| Glob Pattern Matching | ✅ | ❌ | 完全一致で十分 |
| Per-Hat Model | ✅ | ❌ | 1モデルで十分 |
| Per-Hat Backend | ✅ | ❌ | 1バックエンドで十分 |
| Worktree統合 | ✅ | ❌ | Container-useで十分 |
| 環境状態管理 | ✅ | ❌ | 過剰な複雑性 |
| 自動クリーンアップ | ✅ | ❌ | 手動で十分 |

### 3.2 設定ファイル（シンプル化）

**v2.0.0（複雑）**:
```yaml
version: "1.0"
backend:
  type: claude
  model: sonnet
loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"
  idle_timeout_secs: 1800
gates:
  after_plan: true
  after_implementation: false
  before_pr: true
quality:
  min_score: 8
  auto_approve_above: 9
state:
  use_github_labels: true
  label_prefix: "orch"
  use_scratchpad: true
  scratchpad_path: ".agent/scratchpad.md"
auto_issue:
  enabled: true
  min_priority: medium
  labels: [auto-generated, improvement]
  duplicate_check_enabled: true
dependency:
  resolve: true
  ignore: false
memories:
  enabled: true
  inject: auto
tasks:
  enabled: true
worktree:
  enabled: true
  base_dir: ".worktrees"
  auto_cleanup: true
run:
  auto_mode: true
  create_pr: true
hats:
  planner:
    model: opus
    backend: claude
  implementer:
    backend:
      type: kiro
      agent: builder
  # ... 多数のHat定義
```

**v3.0.0（シンプル）**:
```yaml
# orch.yml - これだけで十分
backend: claude          # または opencode
max_iterations: 100      # デフォルト: 100
auto: true               # 承認ゲートを自動化
create_pr: true          # 完了後にPR作成

# オプション: Hatを使用する場合
preset: tdd              # simple, tdd, spec-driven
```

### 3.3 CLI（シンプル化）

**v2.0.0（複雑）**:
```bash
orch run --issue 42 --auto --create-pr --draft --auto-merge --resolve-deps --ignore-deps --report --preset tdd --backend opencode --max-iterations 30 --config custom.yml --verbose --record-session session.jsonl

orch tools memory add "content" -t pattern --tags tag1,tag2
orch tools task add "Title" -p 2 --blocked-by Y
orch emit "build.done" --json '{"status": "pass"}'
orch loops
orch cleanup --issue 42
```

**v3.0.0（シンプル）**:
```bash
# 基本使用（これだけで十分）
orch run 42

# オプション
orch run 42 --auto --create-pr
orch run 42 --preset tdd

# 状態確認
orch status
orch logs --follow
```

---

## 4. 移行戦略

### 4.1 段階的移行

#### Phase 1: 機能フリーズ（1週間）
- 新機能追加を停止
- 既存機能の使用状況を分析

#### Phase 2: 削除準備（2週間）
- 削除対象機能に非推奨警告を追加
- ユーザーに通知

#### Phase 3: 削除実行（1週間）
- Tier 3機能を削除
- テストを更新
- ドキュメントを簡略化

#### Phase 4: リファクタリング（2週間）
- コードベースを整理
- 重複を削除
- パフォーマンス最適化

### 4.2 互換性

- v2.0.0の設定ファイルは自動変換（警告付き）
- 削除機能を使用するスクリプトはエラー終了

---

## 5. 期待される効果

### 5.1 定量的効果

| 指標 | v2.0.0 | v3.0.0 | 削減率 |
|------|--------|--------|-------|
| ソースファイル数 | 100+ | 15 | 85% |
| ドキュメント数 | 91 | 10 | 89% |
| 設定オプション数 | 50+ | 5 | 90% |
| CLIコマンド数 | 15+ | 4 | 73% |
| 依存パッケージ数 | 10 | 6 | 40% |

### 5.2 定性的効果

- **学習曲線の短縮**: 新規ユーザーが5分で使い始められる
- **保守性向上**: 1人で全コードを把握可能
- **バグ発生率低下**: コード量に比例してバグが減少
- **パフォーマンス向上**: 不要な処理の削除

---

## 6. 代替案

### 6.1 案A: 段階的シンプル化（推奨）

上記のv3.0.0提案。最もバランスが取れている。

### 6.2 案B: 完全リライト

- ゼロから書き直し
- メリット: 最もクリーンなコード
- デメリット: 時間がかかる、既存機能のロスト

### 6.3 案C: プラグインアーキテクチャ

- コアを最小化し、機能をプラグインとして分離
- メリット: 柔軟性が高い
- デメリット: 複雑性が増す、設計に時間がかかる

### 6.4 案D: 現状維持

- 何もしない
- メリット: 工数ゼロ
- デメリット: 複雑性が増し続ける

---

## 7. 次のステップ

1. **このドキュメントをレビュー**: 削除候補機能に同意するか確認
2. **優先度を決定**: どの機能を残すか最終決定
3. **移行計画を作成**: 具体的なタスクリストを作成
4. **実装開始**: Phase 1からスタート

---

## 8. 質問事項

以下の点について、ご意見をいただけますか？

1. **Hatシステム**: 残すか、削除するか？
2. **プリセット**: tdd/spec-driven は必要か？
3. **Container-use統合**: 残すか、削除するか？
4. **Issue依存関係**: 残すか、削除するか？
5. **その他**: 残したい機能、追加したい機能はあるか？

---

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-28 | 初版作成 | AI Assistant |
