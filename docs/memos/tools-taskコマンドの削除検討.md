# tools taskコマンドの削除検討

## 結論

**削除する**

## 理由

`orch tools task` は使われていない機能。

### 問題点

| 観点 | 状況 |
|------|------|
| AIが使う？ | Claude/OpenCodeは自前でタスク管理できる |
| 人間が使う？ | GitHub Issueのチェックリストで十分 |
| loop.tsと連携？ | していない |
| 実際の利用 | 確認できず |

### 機能概要（削除対象）

```bash
orch tools task add "タスク名"      # タスク追加
orch tools task list               # 一覧表示
orch tools task ready              # 実行可能なタスク
orch tools task close <id>         # 完了
```

`.agent/tasks.jsonl` でローカルタスクを管理する機能だが、ユースケースが不明確。

## 削除対象ファイル

| ファイル | 内容 |
|---------|------|
| `src/cli/commands/tools.ts` | toolsコマンド定義 |
| `src/core/orch-task-manager.ts` | タスク管理ロジック |
| `src/core/orch-task-manager.test.ts` | テスト |
| `src/core/types.ts` | `TasksConfig`, `TaskEntry` 等の型定義 |

## 関連設定（削除対象）

`orch.yml` の `tasks` セクション：

```yaml
tasks:
  enabled: true
```

## 移行

不要（使われていないため）

## 優先度

低 - 害はないので急がない
