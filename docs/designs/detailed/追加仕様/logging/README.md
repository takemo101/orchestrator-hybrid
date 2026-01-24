# logging サブ機能 設計書

## 概要

orchestrator-hybridのタスク実行中に、AIエージェントの出力をリアルタイムで確認できる機能の詳細設計です。

## 対応機能

- **F-008**: 実行ログリアルタイム確認

## 設計書一覧

| ファイル | 内容 |
|---------|------|
| [詳細設計書.md](./詳細設計書.md) | 概要、アーキテクチャ、処理フロー |
| [バックエンド設計書.md](./バックエンド設計書.md) | LogWriter/LogStreamer の実装仕様 |

## 主要コンポーネント

### LogWriter

**責務**: ログファイルへの書き込み

**ファイル**: `src/core/log-writer.ts`

**主要メソッド**:
- `initialize()`: ログディレクトリを作成
- `writeStdout(data)`: 標準出力を記録
- `writeStderr(data)`: 標準エラー出力を記録
- `writeOutput(data)`: 任意のメッセージを記録

### LogStreamer

**責務**: ログファイルのリアルタイム読み取り

**ファイル**: `src/core/log-streamer.ts`

**主要メソッド**:
- `stream(callback)`: ログファイルをストリーミング
- `stop()`: ストリーミングを停止

## ディレクトリ構造

- `.agent/<task-id>/` - タスクごとのディレクトリ
  - `PROMPT.md` - AIに渡すプロンプト（既存）
  - `output_history.txt` - ループ検出用（既存）
  - `output.log` - 全出力（新規）
  - `stdout.log` - 標準出力のみ（新規）
  - `stderr.log` - 標準エラー出力のみ（新規）
  - `report.md` - 実行レポート（既存）

## ログファイルの役割

| ファイル | 内容 | 用途 |
|---------|------|------|
| **output.log** | stdout + stderr の全出力 | デフォルトの監視対象 |
| **stdout.log** | 標準出力のみ | 正常な出力のみを確認 |
| **stderr.log** | 標準エラー出力のみ | エラーメッセージのみを確認 |

## CLI コマンド

```bash
# タスクのログを一度だけ表示
orch logs -t <task-id>

# タスクのログをリアルタイム監視
orch logs -t <task-id> -f

# タスクテーブルを表示（既存の動作）
orch logs --table
```

## 実装優先順位

1. **LogWriter** の実装
2. **LogStreamer** の実装
3. **Loop Engine** への統合
4. **CLI** への統合
5. **テスト** の作成

## テスト方針

### 単体テスト

- LogWriter のファイル書き込み
- LogStreamer のファイル読み取り
- AbortController による停止制御

### 統合テスト

- Loop Engine との統合
- CLI コマンドの動作確認
- 並列タスクのログ分離

### 手動テスト

```bash
# 1. タスクを実行
orch run --issue 42 --auto

# 2. 別のターミナルでログを監視
orch logs -t <task-id> -f

# 3. ログファイルを直接確認
cat .agent/<task-id>/output.log
tail -f .agent/<task-id>/output.log
```

## 技術スタック

| 技術 | 用途 |
|------|------|
| **Bun File API** | ファイル読み書き |
| **AbortController** | ストリーミング停止制御 |
| **fs.mkdir** | ディレクトリ作成 |

## 参考資料

- [基本設計書 4.3 ログ管理システム](../../basic/BASIC-ORCH-001_追加仕様.md#43-ログ管理システムf-008対応)
- [Bun File API ドキュメント](https://bun.sh/docs/api/file-io)
- [AbortController MDN](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)

---

最終更新: 2026-01-24
