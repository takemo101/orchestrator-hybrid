# Orchestrator Hybrid - 使用ガイド

詳細な使用方法とベストプラクティスのガイド。

## 目次

1. [インストール](#インストール)
2. [基本的な使い方](#基本的な使い方)
3. [設定ファイル詳細](#設定ファイル詳細)
4. [プリセット](#プリセット)
5. [Hatシステム](#hatシステム)
6. [承認ゲート](#承認ゲート)
7. [セッション管理](#セッション管理)
8. [並列実行](#並列実行)
9. [トラブルシューティング](#トラブルシューティング)
10. [高度な使い方](#高度な使い方)

## インストール

### 前提条件

- **Bun**: 1.0以上。エンジンの実行に使用します。
- **gh CLI**: GitHub操作（Issue取得、PR作成、ラベル管理）に必須です。認証済みである必要があります。
- **claude / opencode**: AIエージェントとして動作するバックエンドツールです。

### インストール方法

リポジトリをクローンし、依存関係をインストールします。

```bash
git clone https://github.com/takemo101/orchestrator-hybrid.git
cd orchestrator-hybrid
bun install
```

### バイナリのビルドとグローバルインストール

バイナリとしてビルドし、PATHの通った場所に配置することで、どこからでも `orch` コマンドを使用できるようになります。

```bash
# バイナリをビルド
bun run build:binary

# PATHの通ったディレクトリ（例: /usr/local/bin）に移動
sudo mv orch /usr/local/bin/

# 実行確認
orch --version
```

---

## 基本的な使い方

### 最初のタスク実行

GitHub Issue番号を指定して実行します。デフォルトでは承認ゲートで一時停止します。

```bash
orch run --issue 123
```

### 自動モード

`--auto` フラグを付けると、承認ゲートを自動的に承認し、人間の介入なしでループを継続します。

```bash
orch run --issue 123 --auto
```

### PR作成

タスク完了後にプルリクエストを自動作成します。

```bash
# CI成功後に自動マージを有効にする場合は --auto-merge を追加
orch run --issue 123 --auto --create-pr --draft
```

---

## 設定ファイル詳細

`orch.yml` はプロジェクトのルートディレクトリに配置します。

### orch.yml の構造

```yaml
version: "1.0"

# バックエンド設定
backend: claude                    # claude | opencode

# ループ設定
max_iterations: 100               # 最大反復回数
completion_keyword: "LOOP_COMPLETE" # 完了とみなすキーワード

# 承認ゲート設定
# false に設定するとそのポイントでの停止をスキップします
gates:
  after_plan: true                # 計画立案後の確認
  after_implementation: false     # 実装完了後の確認
  before_pr: true                 # PR作成直前の最終確認

# セッション設定
session:
  manager: auto                   # auto | native | tmux | zellij
  prefix: orch                    # セッション名の接頭辞
  capture_interval: 500           # ログキャプチャ間隔 (ms)

# Worktree設定
worktree:
  enabled: true                   # Issueごとに独立したworktreeを作成
  base_dir: ".worktrees"          # 作成先ディレクトリ
  copy_files:                     # 元ディレクトリからコピーするファイル
    - ".env"
    - "auth.json"
```

### バックエンド設定
- **claude**: [Claude Code](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code) を使用します。
- **opencode**: OpenCode (Open Interpreter等) を使用します。

---

## プリセット

プリセットを使用することで、特定のワークフローに適した設定（Hatの構成など）を簡単に適用できます。

### simple (デフォルト)
Hatを使用しない単純なループです。AIが自律的にタスクを進め、完了時に `LOOP_COMPLETE` を出力するまで繰り返します。

```bash
orch run --issue 123 --preset simple
```

### tdd
テスト駆動開発（Red → Green → Refactor）のサイクルを強制するプリセットです。以下のHatが自動的に構成されます。
- **Tester**: テスト作成・実行
- **Implementer**: テストをパスさせるための実装
- **Refactorer**: コードの整理

```bash
orch run --issue 123 --preset tdd
```

### カスタムプリセット作成
`orch.yml` の `hats` セクションを定義することで、独自のワークフローを作成できます。

---

## Hatシステム

Hatシステムは、AIエージェントに「役割」を与え、特定のイベントに応じてその役割を切り替える仕組みです。

### 概要
AIの出力に含まれる `EVENT: <イベント名>` を検出し、次のイテレーションでそのイベントをトリガーとするHatへ切り替えます。

### 組み込みHat
`tdd` プリセット等で利用される標準的なHatです。
- **Tester**: `task.start` または `code.written` で起動。 `tests.failing` または `tests.passing` を発行。
- **Implementer**: `tests.failing` で起動。 `code.written` を発行。
- **Refactorer**: `tests.passing` で起動。 `LOOP_COMPLETE` を発行。

### カスタムHat定義
`orch.yml` で以下のように独自のHatを定義できます。

```yaml
hats:
  reviewer:
    name: "Reviewer"
    triggers: ["build.done"]
    publishes: ["review.approved", "review.revise"]
    instructions: |
      あなたはコードレビュアーです。
      実装が要件を満たしているか、不必要な修正が含まれていないかを確認してください。
```

---

## 承認ゲート

重要なチェックポイントで実行を一時停止し、ユーザーの承認を求める機能です。

### ゲートポイント
- **after_plan**: AIが実行計画を立てた直後に停止。
- **after_implementation**: 実装が完了し、完了宣言が出る直前に停止。
- **before_pr**: PRを作成する直前に停止。

### 自動承認
`--auto` フラグをコマンドライン引数に渡すと、すべてのゲートポイントで自動的に「承認」を選択します。

### 対話的承認
ゲートで停止した場合、CLI上で以下のような選択肢が表示されます。
- `Approve`: 継続します。
- `Reject`: 修正を求めます（指示を入力可能）。
- `Abort`: タスク自体を中止します。

---

## セッション管理 (v3.0.0+)

AIバックエンドの実行プロセスを管理する抽象化レイヤーです。

### 実装タイプ

#### Native
`Bun.spawn` を使用して直接プロセスを起動します。追加のツールは不要で軽量ですが、対話的な再アタッチは制限されます。

#### Tmux
`tmux` のセッション内でバックエンドを実行します。
- 実行中、バックグラウンドで動作させることが可能。
- 別のターミナルから `tmux attach -t orch-issue-123` のようにして直接操作可能。

#### Zellij
`zellij` を使用します。Tmuxと同様の永続的なセッションを提供します。

### 自動検出
`session.manager: auto` の場合、`tmux` -> `zellij` -> `native` の順で利用可能なものが自動的に選択されます。

### セッションへのアタッチ
実行中のセッションを確認したり、直接干渉したりしたい場合は、各マルチプレクサのコマンドを使用するか、`orch logs --follow` を使用してください。

---

## 並列実行

複数のIssueを同時に、それぞれ独立した環境で実行できます。

### 複数Issue実行
カンマ区切りでIssue番号を指定します。

```bash
orch run --issues 121,122,123 --auto
```

### タスク状態監視
実行中のすべてのタスクの状態を一覧表示します。

```bash
orch status --all
```

リアルタイムでログを確認する場合：

```bash
# 特定のタスクを追跡
orch logs --task orch-121 --follow

# 全体のステータスをテーブル形式で更新表示
orch logs --table
```

### Issueステータスラベル

GitHub IssueにステータスラベルをつけてIssueの進行状態を可視化できます。

#### ステータス一覧

| ステータス | ラベル | 色 | 説明 |
|-----------|--------|-----|------|
| `queued` | `orch:queued` | 薄緑 | 実行待ち |
| `running` | `orch:running` | 緑 | 実行中 |
| `completed` | `orch:completed` | 青 | 正常完了 |
| `failed` | `orch:failed` | 赤 | 失敗 |
| `blocked` | `orch:blocked` | 黄 | ブロック中（依存待ち） |
| `pr-created` | `orch:pr-created` | 紫 | PR作成済み |
| `merged` | `orch:merged` | 濃青 | マージ完了 |
| `session-active` | `orch:session-active` | 白 | セッション実行中（v3.0.0+） |

### キャンセルとクリア
```bash
# 特定のタスクを中止
orch cancel --task orch-121

# 終了したタスクの履歴をクリア
orch clear --force
```

---

## トラブルシューティング

### よくある問題
- **gh CLI未認証**: `gh auth login` を実行してください。
- **バックエンド未インストール**: `claude` または `opencode` がPATHに含まれているか確認してください。
- **ループが終わらない**: AIが `LOOP_COMPLETE` を出力していない可能性があります。`--max-iterations` で制限をかけるか、プロンプトを調整してください。

### デバッグモード
詳細なログを表示するには `--verbose` フラグを使用します。

```bash
orch run --issue 123 --verbose
```

### ログの確認
実行時の詳細なログやイベント履歴は `.agent/` ディレクトリ配下に保存されます。

---

## 高度な使い方

### CI/CD統合
GitHub Actions 等で実行する場合、`--auto` フラグを使用して完全自動化できます。

```yaml
- name: Run Orchestrator
  run: orch run --issue ${{ github.event.issue.number }} --auto --create-pr
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### プログラマティック利用
TypeScriptプロジェクトからライブラリとしてインポートして使用することも可能です。

```typescript
import { LoopEngine } from "orchestrator-hybrid";
// ... 詳細は src/index.ts を参照
```
