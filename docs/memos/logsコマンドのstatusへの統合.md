# logsコマンドとstatusコマンドの役割整理

## 結論

| コマンド | 役割 |
|---------|------|
| `orch status` | タスク状態確認（一覧、詳細、テーブル表示） |
| `orch logs` | **実行中のAI出力をリアルタイムストリーミング** |

## 現状の問題

`orch logs --table` と `orch status --all` が重複している。
また、`orch logs` は完了後のログしか見れず、実行中のOpenCode/Claude出力をリアルタイムで確認できない。

## 提案: 役割の明確化

### `orch status` - 状態確認

```bash
# 全タスクの状態一覧
orch status --all
orch status -a

# テーブル表示（logsから移行）
orch status --table
orch status --table --interval 500

# 特定Issueの状態
orch status --issue 42

# 特定タスクの状態
orch status --task <id>
```

### `orch logs` - リアルタイムストリーミング

```bash
# 実行中タスクのAI出力をリアルタイム表示
orch logs --task <id>
orch logs -t <id>

# 省略時は実行中のタスクを自動選択（1つの場合）
orch logs

# 過去のログを表示（完了後）
orch logs -t <id> --lines 50
```

## 移行計画

### Phase 1: statusコマンドへの統合

1. `orch status` に `--table` オプションを追加
2. `orch logs --table` を非推奨化（警告表示）

### Phase 2: logsコマンドのリアルタイム対応

1. バックエンド出力をストリーミングでファイルに書き込む
2. `orch logs` がそのファイルをリアルタイムで読む

詳細は `バックエンド出力のリアルタイムストリーミング.md` を参照。

## 削除対象

- `src/cli-logs.ts` の `--table` 関連コード → `src/cli.ts` の status に移動

## 関連ファイル

- `src/cli.ts` - statusコマンド定義
- `src/cli-logs.ts` - logsコマンド定義
- `docs/memos/バックエンド出力のリアルタイムストリーミング.md` - 実装詳細
