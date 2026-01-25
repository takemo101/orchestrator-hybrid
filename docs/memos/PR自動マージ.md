## PR自動マージ機能（Issue #44）

### 概要
`--create-pr` でPR作成後、CIが成功したら自動的にマージする機能。

### 使用方法
```bash
orch run --issue 42 --auto --create-pr --auto-merge
```

### 動作フロー
1. タスク完了後、PRを作成
2. CIの完了を待機（`gh pr checks --watch`）
3. CI成功 → 自動マージ
4. CI失敗 → エラーログを出力して終了

### 実装方針
- `src/output/pr.ts` に `waitForCIAndMerge()` 関数を追加
- `gh pr checks <PR番号> --watch` でCI完了を待機
- `gh pr merge <PR番号> --squash --delete-branch` でマージ

### 設定ファイル対応
```yaml
# orch.yml
pr:
  auto_merge: true
  merge_method: squash  # squash | merge | rebase
  delete_branch: true   # マージ後にブランチを削除
  ci_timeout_secs: 600  # CIタイムアウト（デフォルト10分）
```

### 参照
- GitHub Issue: https://github.com/takemo101/orchestrator-hybrid/issues/44
