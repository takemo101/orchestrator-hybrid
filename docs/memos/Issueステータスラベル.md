## Issue ステータスラベル機能（Issue #47）

### 概要
タスクの実行状況を GitHub Issue のラベルで管理し、GitHub 上で一目で状態を確認できるようにする。

### ステータスラベル体系

| ラベル | 説明 | 色 |
|--------|------|-----|
| `orch:queued` | 実行待ち | #c2e0c6 (薄緑) |
| `orch:running` | 実行中 | #0e8a16 (緑) |
| `orch:completed` | 正常完了 | #1d76db (青) |
| `orch:failed` | 失敗 | #d93f0b (赤) |
| `orch:blocked` | ブロック中 | #fbca04 (黄) |
| `orch:pr-created` | PR作成済み | #6f42c1 (紫) |
| `orch:merged` | マージ完了 | #0052cc (濃い青) |

### 状態遷移
```
queued → running → completed → pr-created → merged
                ↘ failed
                ↘ blocked
```

### ラベル自動作成
```bash
gh label create "orch:queued" --color "c2e0c6" --description "Queued for execution"
gh label create "orch:running" --color "0e8a16" --description "Currently running"
# ...
```

### 設定ファイル
```yaml
# orch.yml
state:
  use_github_labels: true
  label_prefix: "orch"  # カスタマイズ可能
```

### 実装方針
- `src/input/github.ts` に `ensureLabelsExist()`, `setStatusLabel()` を追加
- 前のステータスラベルを自動削除（排他制御）
- `orch init --labels` でラベルのみ初期化可能

### 参照
- GitHub Issue: https://github.com/takemo101/orchestrator-hybrid/issues/47
