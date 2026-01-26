# orchestrator-hybrid 追加仕様 要件定義書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | REQ-ORCH-001 |
| バージョン | 1.4.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-24 |
| 最終更新日 | 2026-01-26 |
| 作成者 | AI Assistant |
| 承認者 | - |

---

## 1. プロジェクト概要

### 1.1 背景

orchestrator-hybridは、GitHub Issueを入力としてAIエージェントを自動ループ実行するCLIツールです。現在、container-useによるサンドボックス環境に対応していますが、以下の課題があります：

- Docker環境での実行に対応していない
- コンテナ環境が利用できない場合（macOS/Windows等）のフォールバック手段がない
- YAML設定ファイルの補完機能がなく、設定ミスが発生しやすい
- ralph-loop実行時に発見された改善点を手動でIssue化する必要がある

### 1.2 目的

本プロジェクトは、以下を実現することを目的とします：

1. **実行環境の選択肢拡大**: Dockerサンドボックス、およびホスト環境での直接実行に対応し、あらゆる環境で利用可能に
2. **開発者体験の向上**: JSON Schemaによる設定ファイルの補完・検証機能の提供
3. **改善サイクルの自動化**: 改善点の自動Issue化による継続的改善の促進
4. **柔軟なモデル選択**: Hat毎に異なるAIモデルを指定可能にし、コスト最適化とタスク特化を実現
5. **永続的な学習**: セッション間で学習内容を蓄積し、プロジェクト固有の知識を活用
6. **真の並列実行**: git worktreeを使った完全に隔離された並列タスク実行

### 1.3 ゴール

| KPI | 目標値 | 測定方法 |
|-----|--------|----------|
| Docker環境での実行成功率 | 95%以上 | 統合テスト結果 |
| ホスト環境での実行成功率 | 99%以上 | 統合テスト結果 |
| YAML設定ミス削減率 | 80%削減 | Issue報告数の比較 |
| 改善Issue自動作成率 | 100% | ralph-loop実行時の自動作成数 |
| Hat毎のモデル選択活用率 | 50%以上 | 設定ファイル分析 |
| Memories活用による改善提案精度向上 | 30%向上 | 改善提案の品質評価 |
| 並列実行によるスループット向上 | 2倍以上 | 複数Issue同時実行時の完了時間 |

### 1.4 スコープ

#### 対象範囲

- Docker sandboxアダプターの実装
- ホスト環境での直接実行アダプターの実装
- config.yml/orch.ymlのJSON Schema定義
- ralph-loop実行時の改善Issue自動作成機能
- Hat毎のAIモデル選択機能
- セッション間での学習内容永続化（Memories System）
- タスク管理システム（Tasks System）
- セッション記録・リプレイ機能
- git worktreeを使った並列ループ実行
- Hat毎のバックエンド選択機能
- カスタムバックエンド統合機能
- CLIイベント発行機能
- イベントトピックのワイルドカードマッチング

#### 対象外

- Podman等のその他コンテナランタイム対応
- GitHub Issue以外の入力ソース対応
- 既存機能の大幅なリファクタリング

---

## 2. ステークホルダー

### 2.1 ステークホルダー一覧

| 役割 | 担当者/部門 | 関心事 | 影響度 |
|------|------------|--------|--------|
| プロダクトオーナー | - | 機能拡張による利用者増加 | 高 |
| 開発チーム | - | 実装の容易性、保守性 | 高 |
| エンドユーザー（開発者） | - | 設定の簡便性、実行環境の柔軟性 | 高 |

### 2.2 ユーザーペルソナ

#### ペルソナ1: AIエージェント開発者

| 項目 | 内容 |
|------|------|
| 属性 | 30代、ソフトウェアエンジニア、AI/MLに興味 |
| 課題 | - Docker環境でのテストが必要だが対応していない<br>- macOS/WindowsでDockerが使えない場合がある<br>- YAML設定ミスで実行失敗することがある<br>- 改善点を手動でIssue化するのが面倒 |
| ニーズ | - Docker環境での実行サポート<br>- コンテナが使えない場合のホスト実行<br>- エディタでの設定補完<br>- 改善点の自動Issue化 |
| 利用シーン | ローカル開発環境、CI/CD環境 |

---

## 3. 機能要件

### 3.1 機能一覧

| ID | 機能名 | 概要 | 優先度 | フェーズ |
|----|--------|------|--------|---------|
| F-001 | Docker sandbox対応 | Dockerコンテナ内でのコード実行 | 必須 | Phase 1 |
| F-002 | ホスト環境実行対応 | ホスト環境での直接コード実行（フォールバック用） | 必須 | Phase 1 |
| F-003 | 実行環境選択機能 | config.yml/orch.ymlで実行環境種別を指定 | 必須 | Phase 1 |
| F-004 | JSON Schema定義 | config.yml/orch.ymlのスキーマ定義 | 必須 | Phase 1 |
| F-005 | スキーマ検証機能 | 起動時のYAML検証 | 必須 | Phase 1 |
| F-006 | 改善Issue自動作成 | ralph-loop実行時の自動Issue作成 | 重要 | Phase 2 |
| F-007 | Issue作成条件設定 | 自動作成の有効/無効切り替え | 重要 | Phase 2 |
| F-008 | 実行ログリアルタイム確認 | タスク実行中のAIエージェント出力をリアルタイムで確認 | 重要 | Phase 1 |
| F-009 | PR自動マージ機能 | CI成功後にPRを自動マージ | 重要 | Phase 3 |
| F-010 | リアルタイムログ監視機能 | 別ターミナルから実行中タスクのログを監視 | 重要 | Phase 3 |
| F-011 | Issue依存関係管理機能 | Issue間の依存関係を管理し、依存順に実行 | 重要 | Phase 3 |
| F-012 | Issueステータスラベル機能 | GitHub Issueラベルでタスク状態を管理 | 重要 | Phase 3 |
| F-013 | Per-Hat/Step Model Selection | Hat毎に異なるAIモデルを指定可能 | 必須 | Phase 4 |
| F-014 | Memories System | `.agent/memories.md`にセッション間で学習内容を永続化 | 必須 | Phase 4 |
| F-015 | Tasks System | `.agent/tasks.jsonl`でタスクをJSONL形式で管理 | 必須 | Phase 4 |
| F-016 | Session Recording | `--record-session <FILE>`でJSONLにセッション記録 | 必須 | Phase 4 |
| F-017 | Multi-Loop Concurrency | git worktreeを使った並列実行（ファイルシステム分離） | 重要 | Phase 4 |
| F-018 | Per-Hat Backend Configuration | Hat毎に異なるバックエンドを指定 | 重要 | Phase 4 |
| F-019 | Custom Backends | 任意のCLI AIエージェントを統合可能 | 重要 | Phase 4 |
| F-020 | Event Emission CLI | `orch emit`コマンドでCLI経由でイベント発行 | 重要 | Phase 4 |
| F-021 | Glob Pattern Event Matching | イベントトピックのワイルドカードマッチング | 中 | Phase 4 |

### 3.2 ユーザーストーリー

#### US-001: Docker環境での実行

- **ユーザー**: AIエージェント開発者
- **したいこと**: Docker環境でコードを実行したい
- **理由**: 本番環境に近い環境でテストするため
- **受け入れ基準**:
  - [ ] orch.ymlで`sandbox.type: docker`を指定できる
  - [ ] Dockerコンテナ内でコードが実行される
  - [ ] 実行結果がホスト側に返される
  - [ ] コンテナは実行後に自動削除される
- **関連機能**: F-001, F-003

#### US-001-2: ホスト環境での実行

- **ユーザー**: AIエージェント開発者（macOS/Windows環境）
- **したいこと**: DockerやContainer-useが使えない環境でもコードを実行したい
- **理由**: macOSやWindowsなどコンテナ環境が利用困難な場合でもツールを使いたいため
- **受け入れ基準**:
  - [ ] orch.ymlで`sandbox.type: host`を指定できる
  - [ ] ホスト環境で直接コードが実行される
  - [ ] 実行結果が正しく取得できる
  - [ ] セキュリティ警告が表示される（隔離されていない旨）
- **関連機能**: F-002, F-003

#### US-002: YAML設定の補完

- **ユーザー**: AIエージェント開発者
- **したいこと**: VSCodeでYAML設定を補完したい
- **理由**: 設定ミスを減らし、効率的に設定するため
- **受け入れ基準**:
  - [ ] VSCodeでconfig.ymlを開くと補完が効く
  - [ ] orch.ymlでも補完が効く
  - [ ] 不正な値を入力すると警告が表示される
  - [ ] 必須項目が未入力の場合に警告が表示される
- **関連機能**: F-004, F-005

#### US-003: 改善点の自動Issue化

- **ユーザー**: AIエージェント開発者
- **したいこと**: ralph-loopで見つかった改善点を自動でIssue化したい
- **理由**: 手動でIssue作成する手間を省き、改善サイクルを加速するため
- **受け入れ基準**:
  - [ ] ralph-loop実行時に改善点が検出される
  - [ ] 改善点が自動的にGitHub Issueとして作成される
  - [ ] Issueには改善内容、優先度、関連ファイルが記載される
  - [ ] 重複Issue作成を防ぐ仕組みがある
- **関連機能**: F-006, F-007

#### US-004: 実行ログのリアルタイム確認

- **ユーザー**: AIエージェント開発者
- **したいこと**: 実行中のタスクのAIエージェント出力をリアルタイムで確認したい
- **理由**: タスクの進捗状況を把握し、問題発生時に早期に対応するため
- **受け入れ基準**:
  - [ ] `orch logs -f -t <task-id>`でリアルタイムにAIエージェントの出力が表示される
  - [ ] 複数タスク実行時も特定タスクのログを個別に確認できる
  - [ ] ログはファイルにも保存され、後から確認できる
  - [ ] Ctrl+Cで監視を終了できる
- **関連機能**: F-008

#### US-005: PR自動マージ

- **ユーザー**: AIエージェント開発者
- **したいこと**: PR作成後、CIが成功したら自動的にマージしたい
- **理由**: 手動でCIを監視してマージする手間を省き、完全自動化を実現するため
- **受け入れ基準**:
  - [ ] `--auto-merge`フラグでPR自動マージを有効化できる
  - [ ] CI完了を自動的に待機する
  - [ ] CI成功時に自動マージされる
  - [ ] CI失敗時はエラーログを出力して終了する
  - [ ] マージ方式（squash/merge/rebase）を設定できる
- **関連機能**: F-009

#### US-006: 別ターミナルからのログ監視

- **ユーザー**: AIエージェント開発者
- **したいこと**: 実行中のタスクのログを別ターミナルからリアルタイムで監視したい
- **理由**: 実行ターミナルを占有せずに、複数のタスクを同時に監視するため
- **受け入れ基準**:
  - [ ] `orch logs --task <task-id> --follow`で別ターミナルから監視できる
  - [ ] 実行中のタスク一覧から選択して監視できる
  - [ ] 最新のタスクを自動的に監視できる（`--latest`）
  - [ ] ログファイルの新しい行がリアルタイムで表示される
- **関連機能**: F-010

#### US-007: Issue依存関係の管理

- **ユーザー**: AIエージェント開発者
- **したいこと**: Issue間の依存関係を管理し、依存Issueが完了してから実行したい
- **理由**: 依存関係のあるタスクを正しい順序で実行し、エラーを防ぐため
- **受け入れ基準**:
  - [ ] 依存Issueが未完了の場合、実行を中断できる
  - [ ] `--resolve-deps`で依存Issueを先に実行できる
  - [ ] 複数Issueを依存順にソートして実行できる
  - [ ] 循環依存を検出してエラーを出力する
  - [ ] GitHub Issue Dependencies APIを使用する
- **関連機能**: F-011

#### US-008: Issueステータスラベルの管理

- **ユーザー**: AIエージェント開発者
- **したいこと**: タスクの実行状況をGitHub Issueのラベルで一目で確認したい
- **理由**: GitHub上でタスクの状態を視覚的に把握し、チーム全体で進捗を共有するため
- **受け入れ基準**:
  - [ ] タスク開始時に`orch:running`ラベルが自動付与される
  - [ ] タスク完了時に`orch:completed`ラベルに変更される
  - [ ] PR作成時に`orch:pr-created`ラベルが追加される
  - [ ] マージ時に`orch:merged`ラベルに変更される
  - [ ] 失敗時は`orch:failed`ラベルが付与される
- **関連機能**: F-012

#### US-009: Hat毎のモデル選択

- **ユーザー**: AIエージェント開発者
- **したいこと**: Hat毎に異なるAIモデルを使い分けたい
- **理由**: コスト最適化とタスク特化のため（軽いタスクはHaiku、重要な判断はOpus）
- **受け入れ基準**:
  - [ ] orch.ymlで`hats.<hat>.model`を指定できる
  - [ ] Hat実行時に指定されたモデルが使用される
  - [ ] モデル未指定時は`backend.model`を継承する
  - [ ] Claude Code CLIのモデルエイリアス（opus/sonnet/haiku）が使える
- **関連機能**: F-013

#### US-010: セッション間での学習蓄積

- **ユーザー**: AIエージェント開発者
- **したいこと**: 過去のセッションで学んだパターンや解決策を次回以降も活用したい
- **理由**: 同じ問題を繰り返し解決する手間を省き、プロジェクト固有の知識を蓄積するため
- **受け入れ基準**:
  - [ ] `.agent/memories.md`に学習内容が保存される
  - [ ] 次回実行時にmemoriesが自動的にプロンプトに注入される
  - [ ] `orch tools memory add/search/list/show/delete`でCLI管理できる
  - [ ] memoriesは複数ループ間で共有される（worktreeでもシンボリックリンク）
- **関連機能**: F-014

#### US-011: タスク依存関係の追跡

- **ユーザー**: AIエージェント開発者
- **したいこと**: タスク間の依存関係を管理し、ブロック状態を可視化したい
- **理由**: 複雑なタスクの進捗を把握し、ループ完了検証に活用するため
- **受け入れ基準**:
  - [ ] `.agent/tasks.jsonl`でタスクをJSONL形式で管理
  - [ ] `orch tools task add/list/ready/close`でCLI管理できる
  - [ ] `--blocked-by`オプションで依存関係を設定できる
  - [ ] `orch tools task ready`でブロックされていないタスクのみ表示
- **関連機能**: F-015

#### US-012: セッション記録とリプレイ

- **ユーザー**: AIエージェント開発者
- **したいこと**: セッションを記録してデバッグやテストに活用したい
- **理由**: 問題発生時の再現やテストの自動化のため
- **受け入れ基準**:
  - [ ] `--record-session <FILE>`でJSONLにセッション記録
  - [ ] 記録されたセッションをリプレイできる
  - [ ] Smoke testで記録されたフィクスチャを使用できる
  - [ ] APIコール不要で高速・決定的なテスト実行
- **関連機能**: F-016

#### US-013: 完全に隔離された並列実行

- **ユーザー**: AIエージェント開発者
- **したいこと**: 複数のタスクを完全に隔離された環境で並列実行したい
- **理由**: ファイルシステムの競合を避け、真の並列実行を実現するため
- **受け入れ基準**:
  - [ ] 最初のループはプライマリ環境で実行される
  - [ ] 2つ目以降のループは自動的にworktreeに分離される
  - [ ] 各ループは独立したevents/tasks/scratchpadを持つ
  - [ ] memoriesはシンボリックリンクで共有される
  - [ ] ループ完了時に自動マージされる（AI駆動のコンフリクト解決）
- **関連機能**: F-017

#### US-014: Hat毎のバックエンド選択

- **ユーザー**: AIエージェント開発者
- **したいこと**: Hat毎に異なるバックエンド（Claude/Gemini/カスタム）を使い分けたい
- **理由**: タスク特化やコスト最適化のため（例: AWS操作はKiro、コードレビューはGemini）
- **受け入れ基準**:
  - [ ] orch.ymlで`hats.<hat>.backend`を指定できる
  - [ ] 文字列（"claude"/"gemini"）またはオブジェクト（Kiro agent指定）で設定可能
  - [ ] Hat実行時に指定されたバックエンドが使用される
  - [ ] バックエンド未指定時は`backend.type`を継承する
- **関連機能**: F-018

#### US-015: カスタムバックエンドの統合

- **ユーザー**: AIエージェント開発者
- **したいこと**: 任意のCLI AIエージェントをバックエンドとして統合したい
- **理由**: 社内ツールや新しいAIエージェントを活用するため
- **受け入れ基準**:
  - [ ] orch.ymlで`backend.command`と`backend.args`を指定できる
  - [ ] `prompt_mode: arg`または`stdin`でプロンプト渡し方を選択できる
  - [ ] `prompt_flag`でプロンプトフラグ（`-p`等）を指定できる
  - [ ] カスタムバックエンドが正常に実行される
- **関連機能**: F-019

#### US-016: CLI経由でのイベント発行

- **ユーザー**: AIエージェント開発者
- **したいこと**: CLI経由で明示的にイベントを発行したい
- **理由**: Hat間のハンドオフを手動で制御したい場合があるため
- **受け入れ基準**:
  - [ ] `orch emit <topic> <message>`でイベントを発行できる
  - [ ] `--json`オプションでJSONペイロードを渡せる
  - [ ] `--target`オプションで特定Hatへのハンドオフができる
  - [ ] 発行されたイベントがevents.jsonlに記録される
- **関連機能**: F-020

#### US-017: イベントトピックのワイルドカードマッチング

- **ユーザー**: AIエージェント開発者
- **したいこと**: イベントトピックをワイルドカードでマッチングしたい
- **理由**: 複数の関連イベントを1つのHatで処理したいため
- **受け入れ基準**:
  - [ ] `triggers: ["build.*"]`で`build.done`、`build.blocked`等にマッチ
  - [ ] `triggers: ["*.done"]`で任意の完了イベントにマッチ
  - [ ] 具体的パターンがワイルドカードより優先される
  - [ ] グローバルワイルドカード（`*`）はフォールバックとして機能
- **関連機能**: F-021

### 3.3 機能詳細

#### F-001: Docker sandbox対応

**概要**: Dockerコンテナ内でコードを実行するアダプターを実装

**入力**:
- 実行コマンド（文字列）
- 作業ディレクトリ（パス）
- 環境変数（キー・バリューペア）
- Dockerイメージ名（文字列）

**出力**:
- 標準出力（文字列）
- 標準エラー出力（文字列）
- 終了コード（数値）

**処理概要**:
1. Dockerイメージの存在確認（なければpull）
2. 一時コンテナの作成
3. ホストのファイルをコンテナにマウント
4. コンテナ内でコマンド実行
5. 実行結果の取得
6. コンテナの削除

**ビジネスルール**:
- BR-001: コンテナは実行後に必ず削除する（`--rm`オプション）
- BR-002: タイムアウトは設定可能（デフォルト: 300秒）
- BR-003: ネットワークアクセスは制限可能

**制約事項**:
- Docker Engineがホストにインストールされている必要がある
- Dockerデーモンが起動している必要がある

---

#### F-002: ホスト環境実行対応

**概要**: コンテナ環境が利用できない場合に、ホスト環境で直接コードを実行するアダプターを実装

**入力**:
- 実行コマンド（文字列）
- 作業ディレクトリ（パス）
- 環境変数（キー・バリューペア）

**出力**:
- 標準出力（文字列）
- 標準エラー出力（文字列）
- 終了コード（数値）

**処理概要**:
1. 作業ディレクトリの存在確認
2. 環境変数の設定
3. ホスト環境でコマンド実行（Bun.spawn等）
4. 実行結果の取得

**ビジネスルール**:
- BR-015: 初回実行時にセキュリティ警告を表示する（「ホスト環境は隔離されていません」）
- BR-016: タイムアウトは設定可能（デフォルト: 300秒）
- BR-017: 実行ログに「host環境で実行中」と明記する

**制約事項**:
- ホスト環境のファイルシステムに直接アクセスするため、セキュリティリスクがある
- 実行環境の再現性は保証されない

**ユースケース**:
- macOSでDockerが利用できない場合
- WindowsでWSL2/Dockerが設定されていない場合
- CI/CD環境でコンテナ実行が制限されている場合
- 軽量な開発・テスト時にコンテナのオーバーヘッドを避けたい場合

---

#### F-003: 実行環境選択機能

**概要**: config.yml/orch.ymlで実行環境種別を指定可能にする

**入力**:
- YAML設定ファイル

**出力**:
- 実行環境アダプターインスタンス

**処理概要**:
1. YAMLから`sandbox.type`を読み取り
2. typeに応じたアダプターを初期化
3. アダプター固有の設定を適用
4. 自動フォールバック処理（設定に応じて）

**YAML設定例**:
```yaml
sandbox:
  type: docker  # docker | container-use | host
  fallback: host  # フォールバック先（オプション）
  docker:
    image: node:20-alpine
    timeout: 300
    network: none
  container-use:
    # 既存設定
  host:
    timeout: 300
    warn_on_start: true  # セキュリティ警告を表示

# v1.3.0 新設定
pr:
  auto_merge: true
  merge_method: squash  # squash | merge | rebase
  delete_branch: true
  ci_timeout_secs: 600

state:
  use_github_labels: true
  label_prefix: "orch"
```

**ビジネスルール**:
- BR-004: `sandbox.type`が未指定の場合はcontainer-useをデフォルトとする
- BR-005: 不正なtypeが指定された場合はエラーを返す
- BR-018: `fallback`が設定されている場合、プライマリ環境が利用不可時に自動切り替え
- BR-019: `type: host`選択時は警告メッセージを表示（`warn_on_start: false`で抑制可能）

**制約事項**:
- サポートする実行環境typeは`docker`、`container-use`、`host`の3種類

---

#### F-004: JSON Schema定義

**概要**: config.yml/orch.ymlのJSON Schemaを定義

**入力**:
- なし（スキーマファイルの作成）

**出力**:
- `config.schema.json`
- `orch.schema.json`

**処理概要**:
1. 既存のTypeScript型定義からスキーマを生成
2. 各フィールドの説明、デフォルト値、制約を記述
3. スキーマファイルをプロジェクトルートに配置

**スキーマ例**:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "sandbox": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": ["docker", "container-use", "host"],
          "default": "container-use",
          "description": "実行環境の種類"
        },
        "fallback": {
          "type": "string",
          "enum": ["docker", "container-use", "host"],
          "description": "プライマリ環境が利用不可時のフォールバック先"
        }
      }
    },
    "pr": {
      "type": "object",
      "properties": {
        "auto_merge": {
          "type": "boolean",
          "default": false,
          "description": "PR作成後、CI成功時に自動マージ"
        },
        "merge_method": {
          "type": "string",
          "enum": ["squash", "merge", "rebase"],
          "default": "squash",
          "description": "マージ方式"
        },
        "delete_branch": {
          "type": "boolean",
          "default": true,
          "description": "マージ後にブランチを削除"
        },
        "ci_timeout_secs": {
          "type": "integer",
          "default": 600,
          "description": "CIタイムアウト（秒）"
        }
      }
    },
    "state": {
      "type": "object",
      "properties": {
        "use_github_labels": {
          "type": "boolean",
          "default": true,
          "description": "GitHub Issueラベルを使用"
        },
        "label_prefix": {
          "type": "string",
          "default": "orch",
          "description": "ラベルのプレフィックス"
        }
      }
    }
  }
}
```

**ビジネスルール**:
- BR-006: スキーマはTypeScript型定義と一致させる
- BR-007: スキーマファイルはバージョン管理する
- BR-020: `host`オプションをスキーマに含める

**制約事項**:
- JSON Schema Draft 7形式で記述

---

#### F-005: スキーマ検証機能

**概要**: CLI起動時にYAML設定をスキーマで検証

**入力**:
- YAML設定ファイル
- JSON Schemaファイル

**出力**:
- 検証結果（成功/失敗）
- エラーメッセージ（失敗時）

**処理概要**:
1. YAMLファイルを読み込み
2. 対応するJSON Schemaを読み込み
3. zodまたはajvで検証
4. エラーがあれば詳細を表示して終了

**ビジネスルール**:
- BR-008: 検証エラー時は実行を中断する
- BR-009: エラーメッセージには該当箇所と修正方法を含める

**制約事項**:
- 検証ライブラリはzodを優先使用

---

#### F-006: 改善Issue自動作成

**概要**: ralph-loop実行時に改善点を自動的にGitHub Issueとして作成

**入力**:
- ralph-loopの実行結果
- 改善点リスト（AIが生成）

**出力**:
- 作成されたGitHub Issue URL

**処理概要**:
1. ralph-loop実行完了時に改善点を抽出
2. 改善点ごとにIssueテンプレートを生成
3. GitHub APIでIssueを作成
4. 作成されたIssue URLをログ出力

**Issueテンプレート**:
```markdown
## 改善提案

### 概要
{改善内容の要約}

### 詳細
{詳細な説明}

### 優先度
{高/中/低}

### 関連ファイル
- {ファイルパス1}
- {ファイルパス2}

### 提案者
ralph-loop (自動生成)
```

**ビジネスルール**:
- BR-010: 同一内容のIssueが既に存在する場合は作成しない
- BR-011: Issueには`auto-generated`ラベルを付与
- BR-012: 優先度に応じてラベルを付与（`priority:high`など）

**制約事項**:
- GitHub Personal Access Tokenが必要
- リポジトリへの書き込み権限が必要

---

#### F-007: Issue作成条件設定

**概要**: 改善Issue自動作成の有効/無効を設定可能にする

**入力**:
- config.yml設定

**出力**:
- Issue作成の実行/スキップ

**処理概要**:
1. config.ymlから`auto_issue.enabled`を読み取り
2. 有効な場合のみIssue作成処理を実行

**YAML設定例**:
```yaml
auto_issue:
  enabled: true
  min_priority: medium  # high, medium, low
  labels:
    - auto-generated
    - improvement
```

**ビジネスルール**:
- BR-013: `enabled: false`の場合はIssue作成をスキップ
- BR-014: `min_priority`以上の優先度の改善点のみIssue化

**制約事項**:
- なし

---

#### F-008: 実行ログリアルタイム確認

**概要**: タスク実行中のAIエージェント出力（stdout/stderr）をリアルタイムで確認できる機能

**入力**:
- タスクID（オプション、未指定時は全タスク）
- フォローモードフラグ（`-f`）

**出力**:
- AIエージェントの標準出力/標準エラー出力（リアルタイムストリーム）

**処理概要**:
1. タスクIDに対応するログファイルパスを特定（`.agent/<task-id>/output.log`）
2. ログファイルをtailモードで監視
3. 新しい出力があれば即座にコンソールに表示
4. タスク完了またはCtrl+Cで監視終了

**CLI使用例**:
```bash
# 特定タスクのログをリアルタイム確認
orch logs -f -t <task-id>

# 全タスクのログを確認（インターリーブ表示）
orch logs -f

# 過去のログを確認（非リアルタイム）
orch logs -t <task-id>

# 最新N行を表示
orch logs -t <task-id> -n 100
```

**ログファイル構成**:
```
.agent/
├── <task-id>/
│   ├── output.log          # AIエージェントの全出力
│   ├── stdout.log          # 標準出力のみ
│   ├── stderr.log          # 標準エラー出力のみ
│   └── output_history.txt  # 既存：ループ検出用
```

**ビジネスルール**:
- BR-021: ログファイルはタスクごとに分離して保存
- BR-022: リアルタイム表示時はタスクIDをプレフィックスとして付与（複数タスク時）
- BR-023: ログファイルはタスク完了後も保持（`orch clear`で削除）
- BR-024: 大量出力時はバッファリングして表示（1秒間隔でフラッシュ）

**制約事項**:
- ログファイルのサイズ上限は設定可能（デフォルト: 100MB、ローテーション対応）
- 並列タスク実行時は出力が混在する可能性あり（タスクIDプレフィックスで識別）

---

#### F-009: PR自動マージ機能

**概要**: `--create-pr`でPR作成後、CIが成功したら自動的にマージする機能

**入力**:
- `--auto-merge`フラグ（CLIオプション）
- PR番号（PR作成後に取得）
- CI実行結果（GitHub Actions等）

**出力**:
- マージ完了メッセージ
- マージされたPR URL

**処理概要**:
1. PR作成後、PR番号を取得
2. `gh pr checks <PR番号> --watch`でCI完了を待機
3. CI成功時: `gh pr merge <PR番号> --squash --delete-branch`でマージ
4. CI失敗時: エラーログを出力して終了

**CLI使用例**:
```bash
# PR作成後、CI成功時に自動マージ
orch run --issue 42 --auto --create-pr --auto-merge

# マージ方式を指定（設定ファイル）
pr:
  auto_merge: true
  merge_method: squash  # squash | merge | rebase
  delete_branch: true   # マージ後にブランチを削除
  ci_timeout_secs: 600  # CIタイムアウト（デフォルト10分）
```

**ビジネスルール**:
- BR-025: `--auto-merge`は`--create-pr`と同時に指定する必要がある
- BR-026: CIタイムアウト時はエラーを出力して終了（マージしない）
- BR-027: マージ後はブランチを自動削除（`delete_branch: true`の場合）
- BR-028: マージ方式はsquash/merge/rebaseから選択可能（デフォルト: squash）

**制約事項**:
- GitHub CLIがインストールされている必要がある
- リポジトリへの書き込み権限が必要
- CI設定が存在しない場合は即座にマージ

---

#### F-010: リアルタイムログ監視機能

**概要**: 別ターミナルから実行中タスクのログをリアルタイムで監視できる機能

**入力**:
- タスクID（`--task <task-id>`）
- フォローモードフラグ（`--follow`）

**出力**:
- ログファイルの新しい行（リアルタイムストリーム）

**処理概要**:
1. タスクIDに対応するログファイルパスを特定
2. ログファイルを`fs.watch()`またはpollingで監視
3. 新しい行が追加されたら即座にコンソールに出力
4. Ctrl+Cで監視を終了

**CLI使用例**:
```bash
# ターミナル1: タスク実行
orch run --issue 42 --auto

# ターミナル2: リアルタイム監視
orch logs --task <task-id> --follow

# 実行中のタスク一覧から選択
orch logs --follow

# 最新のタスクを監視
orch logs --latest --follow
```

**実装方針**:
- `LogWriter`が書き出すログファイルを`tail -f`的に読み取り
- `fs.watch()`または polling で新しい行を検出
- 既存の`LogWriter` / `LogStreamer`を拡張

**ビジネスルール**:
- BR-029: `--follow`指定時はCtrl+Cで監視を終了できる
- BR-030: タスクが完了したら監視も自動終了する
- BR-031: 複数ターミナルから同時に監視可能

**制約事項**:
- ログファイルが存在しない場合はエラーを出力
- タスクIDが不正な場合はエラーを出力

---

#### F-011: Issue依存関係管理機能

**概要**: Issue間に依存関係がある場合、依存Issueが完了してから実行する機能

**入力**:
- Issue番号（`--issue <番号>`）
- 依存関係解決フラグ（`--resolve-deps`）
- 依存関係無視フラグ（`--ignore-deps`）

**出力**:
- 依存関係グラフ
- 実行順序（トポロジカルソート結果）

**処理概要**:
1. GitHub Issue Dependencies APIで依存関係を取得
2. 依存Issueが未完了の場合:
   - `--resolve-deps`あり: 依存Issueを先に実行
   - `--resolve-deps`なし: エラーを出力して終了
3. 複数Issue実行時は依存関係をトポロジカルソートして実行順を決定
4. 循環依存を検出したらエラーを出力

**CLI使用例**:
```bash
# 依存Issueが未完了ならエラー
orch run --issue 45 --auto
# → "Issue #44 is not completed. Aborting."

# 依存Issueを先に実行
orch run --issue 45 --auto --resolve-deps
# → Issue #44 → Issue #45 の順に実行

# 複数Issueを依存順に実行
orch run --issues 44,45,46 --auto
# → 依存関係をトポロジカルソートして実行

# 依存関係を無視して実行
orch run --issue 45 --auto --ignore-deps

# 依存関係のみチェック（実行しない）
orch run --issue 45 --check-deps
```

**依存関係の取得方法**:
```bash
# GitHub Issue Dependencies API（2025年8月GA）
gh api "repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by"
gh api "repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking"
```

**ビジネスルール**:
- BR-032: 依存Issueが未完了の場合、デフォルトでエラーを出力して終了
- BR-033: `--resolve-deps`指定時は依存Issueを先に実行
- BR-034: 循環依存を検出したらエラーを出力
- BR-035: `--ignore-deps`指定時は依存関係を無視して実行

**制約事項**:
- GitHub Issue Dependencies APIが利用可能である必要がある
- リポジトリへの読み取り権限が必要

---

#### F-012: Issueステータスラベル機能

**概要**: タスクの実行状況をGitHub Issueのラベルで管理し、GitHub上で一目で状態を確認できるようにする

**入力**:
- Issue番号
- タスク状態（queued/running/completed/failed/blocked/pr-created/merged）

**出力**:
- GitHub Issueに付与されたラベル

**処理概要**:
1. タスク開始時に`orch:running`ラベルを付与
2. 前のステータスラベルを自動削除（排他制御）
3. タスク完了時に`orch:completed`ラベルに変更
4. PR作成時に`orch:pr-created`ラベルを追加
5. マージ時に`orch:merged`ラベルに変更
6. 失敗時は`orch:failed`ラベルを付与

**ステータスラベル体系**:

| ラベル | 説明 | 色 |
|--------|------|-----|
| `orch:queued` | 実行待ち | #c2e0c6 (薄緑) |
| `orch:running` | 実行中 | #0e8a16 (緑) |
| `orch:completed` | 正常完了 | #1d76db (青) |
| `orch:failed` | 失敗 | #d93f0b (赤) |
| `orch:blocked` | ブロック中 | #fbca04 (黄) |
| `orch:pr-created` | PR作成済み | #6f42c1 (紫) |
| `orch:merged` | マージ完了 | #0052cc (濃い青) |

**状態遷移**:
```
queued → running → completed → pr-created → merged
                ↘ failed
                ↘ blocked
```

**設定ファイル例**:
```yaml
state:
  use_github_labels: true
  label_prefix: "orch"  # カスタマイズ可能
```

**CLI使用例**:
```bash
# ラベルのみ初期化（リポジトリにラベルを作成）
orch init --labels

# タスク実行時に自動的にラベルを更新
orch run --issue 42 --auto
# → orch:running → orch:completed → orch:pr-created → orch:merged
```

**ビジネスルール**:
- BR-036: ステータスラベルは排他的（同時に複数のステータスラベルは付与しない）
- BR-037: `use_github_labels: false`の場合はラベル管理を無効化
- BR-038: ラベルが存在しない場合は自動作成
- BR-039: `label_prefix`でラベルのプレフィックスをカスタマイズ可能

**制約事項**:
- GitHub APIへのアクセス権限が必要
- リポジトリへの書き込み権限が必要

---

#### F-013: Per-Hat/Step Model Selection

**概要**: Hat毎に異なるAIモデルを指定可能にし、コスト最適化とタスク特化を実現

**入力**:
- Hat定義（orch.yml）
- モデル指定（Hat固有またはグローバル）

**出力**:
- 指定されたモデルでのAI実行

**処理概要**:
1. Hat実行時に`hats.<hat>.model`を確認
2. 未指定の場合は`backend.model`を使用
3. それも未指定の場合はClaude CLIデフォルト（sonnet）
4. `--model`フラグでClaude Code CLIを実行

**YAML設定例**:
```yaml
backend:
  type: claude
  model: sonnet  # グローバルデフォルト

hats:
  planner:
    model: opus  # このHatはOpusを使用
  implementer:
    # model省略 → backend.modelを継承
  reviewer:
    model: haiku  # 軽量モデルで高速レビュー
```

**ビジネスルール**:
- BR-040: モデル解決優先度は `hats.<hat>.model` → `backend.model` → Claude CLIデフォルト
- BR-041: Claude Code CLIのエイリアス（opus/sonnet/haiku）をサポート
- BR-042: フルモデル名（claude-sonnet-4-5-20250929）もサポート

**制約事項**:
- Claude Code CLIがインストールされている必要がある
- OpenCodeバックエンドは別途対応が必要

---

#### F-014: Memories System

**概要**: `.agent/memories.md`にセッション間で学習内容を永続化し、プロジェクト固有の知識を蓄積

**入力**:
- 学習内容（パターン、アーキテクチャ決定、解決策）
- タグ（オプション）

**出力**:
- `.agent/memories.md`への追記
- プロンプトへの自動注入（inject: auto時）

**処理概要**:
1. セッション中に発見したパターンや解決策を記録
2. `.agent/memories.md`に追記
3. 次回実行時にmemoriesを読み込み
4. `inject: auto`の場合はプロンプトに自動注入

**YAML設定例**:
```yaml
memories:
  enabled: true
  inject: auto  # auto, manual, none
```

**CLIコマンド**:
```bash
orch tools memory add "content" -t pattern --tags tag1,tag2
orch tools memory search "query"
orch tools memory list
orch tools memory show <id>
orch tools memory delete <id>
```

**ビジネスルール**:
- BR-043: memoriesはworktree間でシンボリックリンクで共有
- BR-044: `inject: auto`時はプロンプトの先頭に注入
- BR-045: `inject: manual`時はエージェントが明示的に読み込む
- BR-046: `inject: none`時は注入しない

**制約事項**:
- memoriesファイルのサイズ上限は設定可能（デフォルト: 10MB）

---

#### F-015: Tasks System

**概要**: `.agent/tasks.jsonl`でタスクをJSONL形式で管理し、依存関係を追跡

**入力**:
- タスク情報（タイトル、優先度、依存関係）

**出力**:
- `.agent/tasks.jsonl`への追記
- タスク状態の更新

**処理概要**:
1. タスクをJSONL形式で`.agent/tasks.jsonl`に記録
2. 依存関係（`blocked_by`）を追跡
3. `orch tools task ready`でブロックされていないタスクのみ表示
4. ループ完了検証に使用

**JSONL形式**:
```jsonl
{"id": "task-001", "title": "Add auth", "priority": 2, "status": "open", "blocked_by": []}
{"id": "task-002", "title": "Add tests", "priority": 3, "status": "open", "blocked_by": ["task-001"]}
```

**YAML設定例**:
```yaml
tasks:
  enabled: true
```

**CLIコマンド**:
```bash
orch tools task add "Title" -p 2
orch tools task add "X" --blocked-by Y
orch tools task list
orch tools task ready
orch tools task close <id>
```

**ビジネスルール**:
- BR-047: タスクIDは自動生成（task-001, task-002...）
- BR-048: 優先度は1-5（1が最高）
- BR-049: `status`は`open`/`in-progress`/`closed`
- BR-050: 依存タスクが完了するまで`ready`に表示されない

**制約事項**:
- tasksファイルのサイズ上限は設定可能（デフォルト: 1MB）

---

#### F-016: Session Recording

**概要**: `--record-session <FILE>`でJSONLにセッション記録し、デバッグやテストに活用

**入力**:
- セッション実行内容（各イテレーションの入出力）

**出力**:
- JSONL形式のセッション記録ファイル

**処理概要**:
1. `--record-session <FILE>`オプション指定時にセッション記録を開始
2. 各イテレーションの入力プロンプト、出力、イベントをJSONL化
3. ファイルに追記
4. リプレイ時はJSONLを読み込んでテスト実行（APIコール不要）

**CLI使用例**:
```bash
# セッション記録
orch run --issue 42 --record-session session.jsonl

# リプレイ（テスト用）
orch replay session.jsonl
```

**JSONL形式（推定）**:
```jsonl
{"iteration": 1, "hat": "planner", "prompt": "...", "output": "...", "events": ["plan.ready"]}
{"iteration": 2, "hat": "implementer", "prompt": "...", "output": "...", "events": ["code.written"]}
```

**ビジネスルール**:
- BR-051: セッション記録は各イテレーション毎に1行追記
- BR-052: リプレイ時はAPIコールせずに記録された出力を使用
- BR-053: Smoke testで記録されたフィクスチャを使用可能

**制約事項**:
- 記録ファイルのサイズ上限は設定可能（デフォルト: 100MB）

---

#### F-017: Multi-Loop Concurrency

**概要**: git worktreeを使った並列実行で、ファイルシステムを完全に分離

**入力**:
- 複数のループ実行要求

**出力**:
- プライマリループ（in-place実行）
- セカンダリループ（worktreeに分離）
- 自動マージ結果

**処理概要**:
1. 最初のループは`.orch/loop.lock`を取得してin-place実行
2. 2つ目以降のループは`.worktrees/<loop-id>/`にworktreeを作成
3. 各ループは独立したevents/tasks/scratchpadを持つ
4. memoriesはシンボリックリンクで共有
5. ループ完了時に自動マージ（AI駆動のコンフリクト解決）

**ファイル構造**:
```
project/
├── .orch/
│   ├── loop.lock          # プライマリループ
│   ├── loops.json         # ループレジストリ
│   └── merge-queue.jsonl  # マージイベントログ
├── .agent/
│   └── memories.md        # 全ループで共有
└── .worktrees/
    └── orch-20260126-a3f2/
        ├── .orch/events.jsonl
        ├── .agent/
        │   ├── memories.md → ../../.agent/memories.md
        │   └── scratchpad.md
        └── [project files]
```

**CLI使用例**:
```bash
# ターミナル1: プライマリループ
orch run --issue 42 --auto

# ターミナル2: 自動的にworktreeに分離
orch run --issue 43 --auto

# ループ一覧
orch loops

# 特定ループのログ
orch loops logs <loop-id> --follow

# 自動マージをスキップ
orch run --issue 44 --no-auto-merge
```

**ループ状態**:
| 状態 | 説明 |
|------|------|
| `running` | 実行中 |
| `queued` | 完了、マージ待ち |
| `merging` | マージ中 |
| `merged` | マージ完了 |
| `needs-review` | マージ失敗、手動解決必要 |
| `crashed` | プロセス異常終了 |
| `orphan` | worktree存在、未追跡 |
| `discarded` | ユーザーが明示的に破棄 |

**ビジネスルール**:
- BR-054: プライマリループは`.orch/loop.lock`で排他制御
- BR-055: セカンダリループは自動的にworktreeに分離
- BR-056: memoriesはシンボリックリンクで共有（他は分離）
- BR-057: ループ完了時に自動マージ（`--no-auto-merge`で無効化可能）
- BR-058: マージ失敗時は`needs-review`状態にして手動解決を促す

**制約事項**:
- git worktreeが利用可能である必要がある
- 自動マージにはAIによるコンフリクト解決が必要

---

#### F-018: Per-Hat Backend Configuration

**概要**: Hat毎に異なるバックエンド（Claude/Gemini/Kiro/カスタム）を指定可能

**入力**:
- Hat定義（orch.yml）
- バックエンド指定（Hat固有またはグローバル）

**出力**:
- 指定されたバックエンドでのAI実行

**処理概要**:
1. Hat実行時に`hats.<hat>.backend`を確認
2. 未指定の場合は`backend.type`を使用
3. バックエンドに応じたアダプターを初期化
4. Hat実行

**YAML設定例**:
```yaml
backend:
  type: claude  # グローバルデフォルト

hats:
  builder:
    backend: claude  # Claude for coding
  researcher:
    backend:
      type: kiro
      agent: researcher  # Kiro with MCP tools
  reviewer:
    backend: gemini  # Different model for fresh perspective
```

**バックエンドタイプ**:
| タイプ | 構文 | 実行方法 |
|--------|------|----------|
| Named | `backend: "claude"` | 標準バックエンド設定を使用 |
| Kiro Agent | `backend: { type: "kiro", agent: "builder" }` | `kiro-cli --agent builder ...` |
| Custom | `backend: { command: "...", args: [...] }` | カスタムコマンド |

**ビジネスルール**:
- BR-059: バックエンド解決優先度は `hats.<hat>.backend` → `backend.type`
- BR-060: Kiro agentは`{ type: "kiro", agent: "<name>" }`形式で指定
- BR-061: カスタムバックエンドは`{ command: "...", args: [...] }`形式で指定

**制約事項**:
- 指定されたバックエンドがインストールされている必要がある

---

#### F-019: Custom Backends

**概要**: 任意のCLI AIエージェントをバックエンドとして統合可能

**入力**:
- カスタムバックエンド設定（command, args, prompt_mode, prompt_flag）

**出力**:
- カスタムバックエンドでのAI実行

**処理概要**:
1. `backend.command`と`backend.args`を読み込み
2. `prompt_mode`に応じてプロンプトを渡す（arg or stdin）
3. `prompt_flag`が指定されている場合はフラグを付与
4. カスタムコマンドを実行

**YAML設定例**:
```yaml
backend:
  type: custom
  command: "my-agent"
  args: ["--headless", "--auto-approve"]
  prompt_mode: arg        # "arg" or "stdin"
  prompt_flag: "-p"       # オプション
```

**設定フィールド**:
| フィールド | 説明 |
|-----------|------|
| `command` | 実行するCLIコマンド |
| `args` | プロンプト前に挿入される引数 |
| `prompt_mode` | プロンプトの渡し方（`arg`または`stdin`） |
| `prompt_flag` | プロンプト前のフラグ（例: `-p`, `--prompt`） |

**ビジネスルール**:
- BR-062: `prompt_mode: arg`時はコマンドライン引数でプロンプトを渡す
- BR-063: `prompt_mode: stdin`時は標準入力でプロンプトを渡す
- BR-064: `prompt_flag`が省略された場合はプロンプトを位置引数として渡す

**制約事項**:
- カスタムバックエンドがインストールされている必要がある
- カスタムバックエンドの出力形式は標準出力に対応

---

#### F-020: Event Emission CLI

**概要**: `orch emit`コマンドでCLI経由でイベントを発行し、Hat間のハンドオフを制御

**入力**:
- イベントトピック
- メッセージまたはJSONペイロード
- ターゲットHat（オプション）

**出力**:
- events.jsonlへのイベント記録
- 対応するHatのトリガー

**処理概要**:
1. `orch emit <topic> <message>`でイベントを発行
2. `--json`オプションでJSONペイロードを渡す
3. `--target`オプションで特定Hatへのハンドオフ
4. events.jsonlに記録
5. 対応するHatをトリガー

**CLI使用例**:
```bash
orch emit "build.done" "tests: pass, lint: pass"
orch emit "review.done" --json '{"status": "approved"}'
orch emit "handoff" --target reviewer "Please review"
```

**Agent出力内でのイベント発行**:
```xml
<event topic="impl.done">Implementation complete</event>
<event topic="handoff" target="reviewer">Please review</event>
```

**ビジネスルール**:
- BR-065: イベントトピックは任意の文字列
- BR-066: `--json`オプション時はJSONペイロードとして解析
- BR-067: `--target`オプション時は特定Hatへのハンドオフ
- BR-068: イベントはevents.jsonlに記録される

**制約事項**:
- なし

---

#### F-021: Glob Pattern Event Matching

**概要**: イベントトピックのワイルドカードマッチングで、複数の関連イベントを1つのHatで処理

**入力**:
- イベントトピック
- Hatのトリガーパターン（globパターン）

**出力**:
- マッチしたHatのトリガー

**処理概要**:
1. イベント発行時にトピックを確認
2. 各Hatのトリガーパターンとマッチング
3. 具体的パターンを優先
4. ワイルドカードパターンをフォールバックとして使用
5. マッチしたHatをトリガー

**パターン例**:
```yaml
triggers: ["build.*"]   # build.done, build.blocked等
triggers: ["*.done"]    # 任意の完了イベント
triggers: ["*"]         # グローバルワイルドカード（フォールバック用）
```

**マッチングルール**:
| パターン | マッチ対象 |
|---------|-----------|
| `task.start` | 完全一致: `task.start` |
| `build.*` | `build.done`, `build.blocked`, `build.task`等 |
| `*.done` | `build.done`, `review.done`, `test.done`等 |
| `*` | すべて（フォールバック） |

**優先度ルール**:
- 具体的パターンがワイルドカードより優先
- 複数のHatが具体的パターンでマッチした場合はエラー（曖昧なルーティング）
- グローバルワイルドカード（`*`）は具体的ハンドラーがない場合のみトリガー

**ビジネスルール**:
- BR-069: 具体的パターンがワイルドカードより優先
- BR-070: 複数のHatが同じ具体的パターンでマッチした場合はエラー
- BR-071: グローバルワイルドカード（`*`）はフォールバックとして機能

**制約事項**:
- なし

---

## 4. 非機能要件

### 4.1 性能要件

| ID | 要件 | 目標値 | 測定方法 |
|----|------|--------|----------|
| NFR-P-001 | Docker起動時間 | 5秒以内 | 統合テスト |
| NFR-P-002 | スキーマ検証時間 | 100ms以内 | ユニットテスト |
| NFR-P-003 | Issue作成時間 | 3秒以内 | 統合テスト |
| NFR-P-004 | CI監視レスポンス時間 | 1秒以内 | 統合テスト |
| NFR-P-005 | ログ監視遅延 | 500ms以内 | 統合テスト |
| NFR-P-006 | 依存関係解析時間 | 2秒以内（10Issue） | 統合テスト |
| NFR-P-007 | Memories読み込み時間 | 100ms以内（10MB） | ユニットテスト |
| NFR-P-008 | Tasks読み込み時間 | 50ms以内（1000タスク） | ユニットテスト |
| NFR-P-009 | Worktree作成時間 | 5秒以内 | 統合テスト |
| NFR-P-010 | 自動マージ時間 | 30秒以内（コンフリクトなし） | 統合テスト |

### 4.2 可用性要件

| ID | 要件 | 目標値 |
|----|------|--------|
| NFR-A-001 | コンテナ環境障害時のフォールバック | 設定されたfallback環境へ自動切り替え |
| NFR-A-002 | GitHub API障害時の挙動 | エラーログ出力、処理は継続 |
| NFR-A-003 | ホスト環境での継続実行 | コンテナ環境が全て利用不可でもhost環境で実行可能 |
| NFR-A-004 | CIタイムアウト時の挙動 | エラーログ出力、マージせずに終了 |
| NFR-A-005 | ログファイル破損時の挙動 | エラーログ出力、監視を継続 |
| NFR-A-006 | Worktree作成失敗時の挙動 | エラーログ出力、プライマリループで実行 |
| NFR-A-007 | 自動マージ失敗時の挙動 | `needs-review`状態にして手動解決を促す |

### 4.3 セキュリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-S-001 | Dockerコンテナの隔離 | ネットワーク制限、ファイルシステム制限 |
| NFR-S-002 | GitHub Token管理 | 環境変数または設定ファイル（.gitignore対象） |
| NFR-S-003 | 機密情報のログ出力禁止 | トークン、パスワードはマスク |
| NFR-S-004 | ホスト環境実行時の警告 | 隔離されていない環境での実行リスクをユーザーに明示 |
| NFR-S-005 | Memoriesの機密情報保護 | 機密情報を含むmemoriesは暗号化または除外 |
| NFR-S-006 | Worktree間の隔離 | 各worktreeは独立したファイルシステムで隔離 |

### 4.4 ユーザビリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-U-001 | エラーメッセージの明確性 | 原因と対処法を含める |
| NFR-U-002 | VSCode補完対応 | YAML Language Server対応 |
| NFR-U-003 | ドキュメント整備 | README、設定例、トラブルシューティング |
| NFR-U-004 | 実行ログの即時確認 | タスク実行中でもログをリアルタイムで確認可能 |
| NFR-U-005 | CI監視の進捗表示 | CI実行状況をリアルタイムで表示 |
| NFR-U-006 | 依存関係の可視化 | 依存関係グラフを視覚的に表示 |
| NFR-U-007 | Memories検索の容易性 | キーワード検索、タグフィルタリングが可能 |
| NFR-U-008 | Tasks管理の視覚性 | タスク一覧、依存関係が視覚的に確認可能 |
| NFR-U-009 | ループ状態の可視化 | 実行中のループ一覧、状態が一目で確認可能 |

### 4.5 保守性要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-M-001 | ログ出力 | 実行ログ、エラーログ（レベル別） |
| NFR-M-002 | テストカバレッジ | 80%以上 |
| NFR-M-003 | 型安全性 | TypeScript strictモード |

---

## 5. 制約条件

### 5.1 技術的制約

| 制約 | 詳細 | 理由 |
|------|------|------|
| ランタイム | Bun 1.0以上 | 既存プロジェクトの技術スタック |
| 言語 | TypeScript 5.0以上 | 型安全性の確保 |
| YAML解析 | yamlライブラリ | 既存実装との互換性 |
| スキーマ検証 | zod | 既存プロジェクトで使用中 |
| Docker | Docker Engine 20.10以上 | 一般的な環境での動作保証 |

### 5.2 ビジネス制約

| 制約 | 詳細 |
|------|------|
| 予算 | なし（OSS） |
| スケジュール | Phase 1: 2週間、Phase 2: 1週間 |
| リソース | 開発者1名 |

### 5.3 法規制・コンプライアンス

| 要件 | 詳細 |
|------|------|
| ライセンス | MIT License（既存プロジェクトと同一） |
| 依存ライブラリ | MIT/Apache 2.0互換ライセンスのみ使用 |

---

## 6. 外部インターフェース

### 6.1 外部システム連携

| システム名 | 連携内容 | 方式 | 頻度 |
|-----------|---------|------|------|
| Docker Engine | コンテナ実行 | Docker CLI/API | 実行時 |
| GitHub API | Issue作成 | REST API | ralph-loop完了時 |

### 6.2 データ移行

| 移行元 | データ種別 | 件数目安 | 移行方式 |
|--------|-----------|---------|---------|
| なし | - | - | - |

---

## 7. 前提条件と依存関係

### 7.1 前提条件

- Docker Engineがインストールされている（Docker sandbox使用時）
- GitHub Personal Access Tokenが発行されている（Issue自動作成使用時）
- Bunランタイムがインストールされている

### 7.2 依存関係

| 依存先 | 内容 | 影響 |
|--------|------|------|
| container-use | 既存サンドボックス実装 | Docker実装の参考 |
| GitHub API | Issue作成 | API制限、認証エラーの影響 |
| Docker Hub | イメージ取得 | ネットワーク障害の影響 |

---

## 8. リスクと課題

### 8.1 リスク一覧

| ID | リスク | 影響度 | 発生確率 | 対策 |
|----|--------|--------|---------|------|
| R-001 | Docker未インストール環境での実行失敗 | 中 | 中 | host環境へのフォールバック機能を提供 |
| R-002 | GitHub API rate limit超過 | 低 | 低 | リトライ機能、rate limit確認 |
| R-003 | JSON Schemaとコードの不整合 | 中 | 中 | CI/CDでの自動検証 |
| R-004 | Docker実行時のセキュリティリスク | 高 | 低 | ネットワーク制限、read-onlyマウント |
| R-005 | ホスト環境実行時のセキュリティリスク | 高 | 中 | 警告表示必須、ドキュメントでリスク明記 |
| R-006 | CI監視中のネットワーク障害 | 中 | 低 | タイムアウト設定、リトライ機能 |
| R-007 | 依存関係APIの利用不可 | 中 | 低 | エラーメッセージ表示、手動実行を促す |
| R-008 | ラベル付与時のAPI rate limit | 低 | 中 | リトライ機能、rate limit確認 |
| R-009 | Memoriesファイルの肥大化 | 中 | 中 | サイズ上限設定、古いエントリの自動削除 |
| R-010 | Worktree自動マージのコンフリクト | 高 | 中 | AI駆動のコンフリクト解決、手動解決フォールバック |
| R-011 | カスタムバックエンドの互換性問題 | 中 | 低 | ドキュメントで要件明記、エラーハンドリング |
| R-012 | 並列ループ実行時のリソース枯渇 | 中 | 中 | 最大並列数制限、リソース監視 |

### 8.2 未解決課題

| ID | 課題 | 担当 | 期限 |
|----|------|------|------|
| I-001 | Dockerイメージのキャッシュ戦略 | 開発者 | Phase 1完了前 |
| I-002 | Issue重複判定のアルゴリズム詳細 | 開発者 | Phase 2開始前 |
| I-003 | VSCode以外のエディタでの補完対応 | 開発者 | Phase 1完了後 |
| I-004 | CI監視のタイムアウト値の最適化 | 開発者 | Phase 3開始前 |
| I-005 | 依存関係グラフの可視化方法 | 開発者 | Phase 3開始前 |
| I-006 | ラベル体系のカスタマイズ範囲 | 開発者 | Phase 3開始前 |
| I-007 | Memoriesの最適なサイズ上限 | 開発者 | Phase 4開始前 |
| I-008 | Tasksの依存関係解決アルゴリズム詳細 | 開発者 | Phase 4開始前 |
| I-009 | Worktree自動マージのAIプロンプト設計 | 開発者 | Phase 4開始前 |
| I-010 | 並列ループの最大数制限 | 開発者 | Phase 4開始前 |
| I-011 | OpenCodeバックエンドのモデル選択対応 | 開発者 | Phase 4開始前 |
| I-012 | Kiroバックエンドの統合方法 | 開発者 | Phase 4開始前 |

---

## 9. 用語集

| 用語 | 定義 |
|------|------|
| orchestrator-hybrid | GitHub Issueを入力としてAIエージェントを自動ループ実行するCLIツール |
| ralph-loop | AIエージェントによる改善提案ループ実行機能 |
| container-use | 既存のサンドボックス環境実装 |
| sandbox | コード実行環境（隔離された環境） |
| host環境 | ホストマシン上で直接コードを実行する環境（隔離なし） |
| フォールバック | プライマリ環境が利用不可時に代替環境へ自動切り替えする機能 |
| JSON Schema | JSON/YAMLデータ構造の検証スキーマ |
| zod | TypeScript用のスキーマ検証ライブラリ |
| orch.yml | オーケストレーター設定ファイル |
| config.yml | プロジェクト設定ファイル |
| CI | Continuous Integration（継続的インテグレーション） |
| トポロジカルソート | 依存関係を考慮した順序付けアルゴリズム |
| 循環依存 | Issue A → B → A のように依存関係がループする状態 |
| squash merge | 複数のコミットを1つにまとめてマージする方式 |
| Memories | セッション間で永続化される学習内容（`.agent/memories.md`） |
| Tasks | ランタイムタスク追跡システム（`.agent/tasks.jsonl`） |
| Session Recording | セッション実行内容のJSONL記録 |
| Worktree | git worktreeを使った並列実行環境 |
| プライマリループ | 最初に実行されるループ（in-place実行） |
| セカンダリループ | 2つ目以降のループ（worktreeに分離） |
| 自動マージ | AI駆動のコンフリクト解決によるworktreeマージ |
| Per-Hat Model Selection | Hat毎に異なるAIモデルを指定する機能 |
| Per-Hat Backend | Hat毎に異なるバックエンドを指定する機能 |
| Custom Backend | 任意のCLI AIエージェントを統合する機能 |
| Glob Pattern | ワイルドカードを使ったパターンマッチング（例: `build.*`） |
| Kiro | MCP toolsを持つAIエージェント |

---

## 10. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-24 | 初版作成 | AI Assistant |
| 1.1.0 | 2026-01-24 | ホスト環境実行対応（F-002）を追加、フォールバック機能を追加 | AI Assistant |
| 1.2.0 | 2026-01-24 | 実行ログリアルタイム確認機能（F-008）を追加 | AI Assistant |
| 1.3.0 | 2026-01-25 | Phase 3機能を追加（F-009: PR自動マージ、F-010: リアルタイムログ監視、F-011: Issue依存関係管理、F-012: Issueステータスラベル） | AI Assistant |
| 1.4.0 | 2026-01-26 | Phase 4機能を追加（F-013: Per-Hat Model Selection、F-014: Memories System、F-015: Tasks System、F-016: Session Recording、F-017: Multi-Loop Concurrency、F-018: Per-Hat Backend、F-019: Custom Backends、F-020: Event Emission CLI、F-021: Glob Pattern Event Matching） | AI Assistant |

---

## 11. 参考資料

### 11.1 技術ドキュメント

- [Docker Engine API](https://docs.docker.com/engine/api/)
- [GitHub REST API - Issues](https://docs.github.com/en/rest/issues)
- [GitHub Issue Dependencies API](https://docs.github.com/en/rest/issues/dependencies)
- [GitHub CLI - PR Commands](https://cli.github.com/manual/gh_pr)
- [JSON Schema Specification](https://json-schema.org/)
- [Zod Documentation](https://zod.dev/)
- [YAML Language Server](https://github.com/redhat-developer/yaml-language-server)

### 11.2 既存実装参考

- `src/adapters/container.ts` - container-use実装
- `src/core/config.ts` - 設定読み込み実装
- `src/core/types.ts` - 型定義

---

## 付録A: 実装優先順位

### Phase 1（必須機能）
1. F-004: JSON Schema定義
2. F-005: スキーマ検証機能
3. F-001: Docker sandbox対応
4. F-002: ホスト環境実行対応
5. F-003: 実行環境選択機能
6. F-008: 実行ログリアルタイム確認

### Phase 2（重要機能）
1. F-006: 改善Issue自動作成
2. F-007: Issue作成条件設定

### Phase 3（v1.3.0新機能）
1. F-009: PR自動マージ機能
2. F-010: リアルタイムログ監視機能
3. F-011: Issue依存関係管理機能
4. F-012: Issueステータスラベル機能

### Phase 4（v1.4.0新機能）
1. F-013: Per-Hat/Step Model Selection
2. F-014: Memories System
3. F-015: Tasks System
4. F-016: Session Recording
5. F-017: Multi-Loop Concurrency
6. F-018: Per-Hat Backend Configuration
7. F-019: Custom Backends
8. F-020: Event Emission CLI
9. F-021: Glob Pattern Event Matching

### Phase 5（将来検討）
- 他のコンテナランタイム対応（Podman等）
- Issue作成時のテンプレートカスタマイズ
- 改善点の優先度自動判定の精度向上
- 依存関係グラフの可視化UI
- TUI Mode（リアルタイムUI）
- より多くのPresets（adversarial-review、scientific-method等）
