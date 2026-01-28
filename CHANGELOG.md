# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0] - 2026-XX-XX (Unreleased)

### Added

#### Session Management (F-012)
- **ISessionManager インターフェース**: バックエンド実行プロセスの抽象化レイヤー
  - `create()`, `list()`, `getOutput()`, `streamOutput()`, `attach()`, `isRunning()`, `kill()` メソッド
  - 統一されたセッション情報（Session型）
- **NativeSessionManager**: Bun.spawn + ファイルログによる軽量実装
  - `.agent/sessions/<id>/output.log` への出力保存
  - `session.json` によるメタデータ永続化
- **TmuxSessionManager**: tmuxコマンドラッパー
  - `tmux new-session`, `capture-pane`, `attach-session`, `kill-session` 対応
  - 永続性が高く、ターミナルから直接アタッチ可能
- **ZellijSessionManager**: zellijコマンドラッパー
  - `zellij --session`, `action dump-screen`, `attach`, `kill-session` 対応
  - 現代的なターミナルマルチプレクサ対応
- **SessionManagerFactory**: 自動検出ファクトリー
  - 優先順位: tmux > zellij > native
  - `detectAvailableSessionManagers()` で利用可能な実装を検出

### Internal

- 288テストケースで品質保証（セッション管理: 52テスト追加）
- v3.0.0エラークラス追加:
  - `SessionError`: セッション操作エラー

---

## [2.0.0] - 2026-XX-XX (Unreleased)

### Added

#### Worktree Manager (F-201)
- **Git Worktree管理**: Issue単位での並列実行環境を提供
  - worktree作成・削除の自動化
  - ブランチ命名規則: `feature/issue-{number}-{slug}`
  - 複数Issueの同時並列作業をサポート

#### Hybrid Environment Builder (F-202)
- **Worktree + Container統合**: 環境タイプに応じた柔軟な実行環境構築
  - `hybrid`: Worktree + Container-Use（推奨）
  - `worktree-only`: Git worktreeのみ
  - `container-only`: Container-Useのみ
  - `host`: ホスト環境で直接実行

#### Environment State Manager (F-203)
- **GitHub Issueメタデータによる状態管理**: 環境情報をIssueに永続化
  - 環境タイプ、パス、コンテナID等をIssueメタデータとして保存
  - IssueStatusLabelManagerとの統合
  - 環境の復元・継続実行をサポート

#### Auto Cleanup Service (F-204)
- **PRマージ後の自動クリーンアップ**: 不要リソースの自動削除
  - Worktree削除
  - ローカル・リモートブランチ削除
  - Container-Use環境削除
  - dry-runモードによる安全な確認

### Internal

- 726テストケースで品質保証（v1.2.0: 328 → v2.0.0: 726）
- v2.0.0エラークラス追加:
  - `WorktreeError`: Worktree操作エラー
  - `HybridEnvironmentError`: ハイブリッド環境構築エラー
  - `EnvironmentStateError`: 環境状態管理エラー
  - `AutoCleanupError`: 自動クリーンアップエラー

---

## [1.2.0] - 2026-01-25

### Added

#### Sandbox Environment (F-001, F-002, F-003)
- **Docker Sandbox**: Dockerコンテナ内でコマンドを隔離実行
  - ネットワーク制御（`network: none`で完全隔離）
  - タイムアウト設定
  - 自動クリーンアップ（`--rm`フラグ）
- **Host Environment**: ホスト環境での直接実行（Docker/container-use不可時のフォールバック）
  - 初回実行時に警告表示（`warnOnStart: true`）
- **SandboxFactory**: 設定に基づいて適切な実行環境を自動選択
  - プライマリ環境が利用不可の場合、自動でフォールバック
- **ProcessExecutor抽象化**: Bun.spawnへの直接依存を排除
  - 将来のNode.js対応を考慮した設計

#### JSON Schema (F-004, F-005)
- **JSON Schema生成**: `zod-to-json-schema`によるスキーマ自動生成
  - `bun run generate:schema`で`schemas/orch.schema.json`を生成
- **起動時検証**: 設定ファイル読み込み時にスキーマベースのバリデーション

#### Improvement Issue Auto-Creation (F-006, F-007)
- **IssueGenerator**: Scratchpadから改善提案を抽出し、GitHub Issueを自動作成
  - 優先度フィルタリング（`minPriority: medium`で低優先度をスキップ）
  - 重複チェック（既存Issueとタイトル照合）
  - 別リポジトリへの作成サポート（`repository`オプション）
- **改善提案マーカー**: Scratchpad内で以下のマーカーを使用
  ```markdown
  <!-- IMPROVEMENT_START priority:high category:refactoring -->
  ## 提案タイトル
  改善内容の説明
  <!-- IMPROVEMENT_END -->
  ```

#### Real-time Log Viewing (F-008)
- **LogWriter**: タスクごとのログファイル書き込み
  - `stdout.log`, `stderr.log`, `output.log`（マージ）
- **LogStreamer**: リアルタイムログ監視
  - `--follow`オプションでtail -f相当の動作
  - ポーリング間隔設定可能
- **logsコマンド拡張**:
  ```bash
  orch logs --task <id> --follow      # リアルタイム監視
  orch logs --task <id> --lines 50    # 最後の50行
  orch logs --table                   # タスク状態テーブル（レガシー）
  ```

### Changed

- **ContainerAdapter**: SandboxAdapterインターフェースに準拠するようリファクタリング
- **設定スキーマ**: `sandbox`および`autoIssue`セクションを追加
- **アーキテクチャ**: src/adapters/, src/core/, src/output/, src/utils/を拡張

### Internal

- 328テストケースで品質保証
- BunProcessExecutorによるプロセス実行の抽象化
- エラークラス階層（SandboxError, DockerNotFoundError, HostExecutionError等）

---

## [1.1.0] - 2026-01-01

### Added

- 並列タスク実行（`--issues 1,2,3`）
- タスク状態管理（TaskManager）
- 実行レポート生成（`--report`）
- container-useモード（`--container`）

---

## [1.0.0] - 2025-12-15

### Added

- GitHub Issue取得・プロンプト生成
- AIエージェント自動ループ実行
- Hatシステム（役割自動切り替え）
- 承認ゲート
- PR自動作成
- プリセット（simple, tdd, spec-driven）
