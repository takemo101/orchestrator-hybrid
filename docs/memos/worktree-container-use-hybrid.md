# Worktree + Container-Use ハイブリッド環境

## 背景

現在のorchestrator-hybridには以下の課題がある：

1. **container-use単体**: ファイルシステムはホストと共有 → 並列実行時にブランチ競合
2. **worktree未実装**: 要件定義書（F-017）にはあるが未実装
3. **並列実行の制限**: `--issues 1,2,3`で並列実行できるが、同一ディレクトリ内での管理

## 提案: ハイブリッドアプローチ

Worktree（ファイルシステム分離）+ Container-Use（環境分離）を組み合わせる。

```
Issue #42                              Issue #43
    │                                      │
    ▼                                      ▼
.worktrees/issue-42/                  .worktrees/issue-43/
    │                                      │
    ▼                                      ▼
┌───────────────────┐                ┌───────────────────┐
│ container-use     │                │ container-use     │
│ env: abc-123      │                │ env: def-456      │
│ branch: feature/42│                │ branch: feature/43│
└───────────────────┘                └───────────────────┘
```

## メリット

| メリット | 説明 |
|---------|------|
| **完全なファイル分離** | worktreeで別ディレクトリ → ブランチ切り替え不要 |
| **環境分離** | container-useでDB/Redis等もIssueごとに独立 |
| **真の並列実行** | 複数Issueを完全に独立して処理可能 |
| **mainブランチがクリーン** | 未完成コードがmainに残らない |
| **作業再開が容易** | 環境IDとworktreeパスで即座に復帰 |

## 既存スキルとの関連

OpenCodeには既にworktree関連スキルが存在：

| スキル | 用途 |
|--------|------|
| `.opencode/skill/create-worktree/` | worktree作成スクリプト |
| `.opencode/skill/worktree-workflow/` | worktreeワークフロー全体 |
| `.opencode/skill/pr-and-cleanup/` | PR作成 + worktree削除 |

これらを参考にorchestrator-hybrid本体に統合する。

## 設定ファイル案

```yaml
# orch.yml
version: "1.0"

worktree:
  enabled: true                    # worktree使用
  base_dir: ".worktrees"           # worktree格納ディレクトリ
  auto_cleanup: true               # マージ後に自動削除
  copy_env_files:                  # コピーする環境ファイル
    - ".env"
    - ".envrc"
    - ".env.local"

container:
  enabled: true                    # container-useも併用
  image: node:20

# 両方有効時の動作:
# 1. worktree作成 → .worktrees/issue-{number}/
# 2. container-use環境作成 → worktreeをマウント
# 3. 実装作業
# 4. PR作成
# 5. マージ後: worktree削除 + container-use環境削除
```

## 実装に必要な変更

### 新規ファイル

| ファイル | 内容 | 行数見積 |
|---------|------|---------|
| `src/adapters/worktree-manager.ts` | worktree作成/削除/一覧 | ~150行 |
| `src/adapters/worktree-manager.test.ts` | テスト | ~200行 |

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/core/types.ts` | `WorktreeConfigSchema` 追加 |
| `src/core/loop.ts` | worktree + container-use統合ロジック |
| `src/cli.ts` | `--worktree` オプション追加（または `worktree.enabled` で自動） |

## 実行フロー

```
orch run --issue 42 --auto --create-pr
    │
    ├─[1] worktree作成
    │     git worktree add -b feature/issue-42 .worktrees/issue-42 main
    │     cp .env .worktrees/issue-42/
    │
    ├─[2] container-use環境作成
    │     environment_source = ".worktrees/issue-42"
    │     title = "Issue #42"
    │
    ├─[3] 実装ループ
    │     AIエージェントがcontainer-use内で作業
    │
    ├─[4] PR作成
    │     gh pr create --head feature/issue-42
    │
    ├─[5] 自動マージ（auto_merge: true時）
    │
    └─[6] クリーンアップ
          container-use環境削除
          git worktree remove .worktrees/issue-42
          git branch -d feature/issue-42
```

## GitHub Issue状態管理との連携

`.opencode/skill/github-issue-state-management/`を参考に、環境状態をIssueラベル/メタデータで管理：

| ラベル | 説明 |
|--------|------|
| `env:active` | worktree + container-use環境が存在 |
| `env:worktree` | worktreeパスをメタデータに記録 |
| `env:container-id` | container-use環境IDをメタデータに記録 |
| `env:pr-created` | PR作成済み |
| `env:merged` | マージ完了（クリーンアップ待ち） |

## 優先度と工数

| タスク | 優先度 | 工数 |
|--------|--------|------|
| WorktreeManager実装 | 高 | 4-6時間 |
| types.ts拡張 | 高 | 1時間 |
| loop.ts統合 | 高 | 3-4時間 |
| cli.tsオプション追加 | 中 | 1時間 |
| テスト | 高 | 4-5時間 |

**合計**: 約15-17時間

## 関連ドキュメント

- `docs/requirements/REQ-ORCH-001_追加仕様.md` - F-017 Multi-Loop Concurrency
- `docs/memos/ralph-features-to-adopt.md` - Ralphのworktree実装参考
- `.opencode/skill/create-worktree/` - 既存スクリプト
- `.opencode/skill/worktree-workflow/` - ワークフロー定義

## 備考

- container-use単体でも動作可能（worktree.enabled: false）
- worktree単体でも動作可能（container.enabled: false）
- 両方有効時がフルスペック（推奨）
- プラットフォーム固有コード（macOS API等）はworktreeのみ使用（container-use不可）
