# run設定のデフォルト化とCLIリファクタリング

## 背景

現在、`orch run`コマンドの一部オプションはorch.ymlでデフォルト値を設定できない。
ユーザーは毎回`--auto --create-pr`等を指定する必要があり、不便。

## 現状の問題

### 1. 設定ファイルでデフォルト化できないオプション

| CLIオプション | 設定ファイル対応 | 備考 |
|--------------|----------------|------|
| `--auto` | ❌ 未対応 | 承認ゲート自動承認 |
| `--create-pr` | ❌ 未対応 | 完了後にPR作成 |
| `--draft` | ❌ 未対応 | ドラフトPRとして作成 |
| `--auto-merge` | ✅ 対応済み | `pr.auto_merge` |
| `--container` | ✅ 対応済み | `container.enabled` |
| `--resolve-deps` | ✅ 対応済み | `dependency.resolve` |
| `--ignore-deps` | ✅ 対応済み | `dependency.ignore` |

### 2. CLIオプションの肥大化

`orch run`コマンドのオプションが増えすぎており、可読性・保守性が低下している。

現在のオプション一覧：
- `-i, --issue`
- `--issues`
- `-b, --backend`
- `-p, --preset`
- `-m, --max-iterations`
- `-a, --auto`
- `--create-pr`
- `--draft`
- `--container`
- `--auto-merge`
- `--resolve-deps`
- `--ignore-deps`
- `--report`
- `-c, --config`
- `-v, --verbose`

## 提案

### 1. run設定セクションの追加（types.ts）

```yaml
# orch.yml
run:
  auto_mode: true       # --auto のデフォルト
  create_pr: true       # --create-pr のデフォルト
  draft_pr: false       # --draft のデフォルト
```

### 2. CLIオプション処理のリファクタリング

#### 現状
cli.ts内で`handleRunCommand`関数が肥大化し、オプション処理が散在している。

#### 改善案

1. **オプション定義の分離**: `src/cli/options.ts` に定義を集約
2. **設定マージロジックの分離**: `src/cli/config-merger.ts` でCLI/設定ファイル/デフォルト値のマージを一元化
3. **バリデーションの強化**: 矛盾するオプション（`--resolve-deps` + `--ignore-deps`等）の検出

#### ファイル構成案

```
src/
├── cli.ts                    # エントリーポイント（薄く保つ）
├── cli/
│   ├── commands/
│   │   ├── run.ts           # runコマンド
│   │   ├── init.ts          # initコマンド
│   │   ├── status.ts        # statusコマンド
│   │   ├── logs.ts          # logsコマンド
│   │   └── ...
│   ├── options.ts           # オプション定義
│   └── config-merger.ts     # 設定マージロジック
```

### 3. 実装優先度

| タスク | 優先度 | 工数 |
|--------|--------|------|
| run設定セクション追加 | 高 | 小（1-2時間） |
| CLIコマンド分離 | 中 | 中（3-4時間） |
| config-merger実装 | 中 | 中（2-3時間） |

## 関連ファイル

- `src/core/types.ts` - RunConfigSchema追加
- `src/cli.ts` - リファクタリング対象
- `docs/requirements/REQ-ORCH-001_追加仕様.md` - 要件追記

## 備考

- worktree機能（F-017）実装前にCLIをリファクタリングしておくと、今後のオプション追加が楽になる
- 設定ファイルのJSON Schema（`schemas/orch.schema.json`）も更新が必要
