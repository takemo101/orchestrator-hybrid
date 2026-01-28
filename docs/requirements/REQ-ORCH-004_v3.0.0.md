# orchestrator-hybrid v3.0.0 要件定義書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | REQ-ORCH-004 |
| バージョン | 1.0.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-28 |
| 作成者 | AI Assistant |

---

## 1. 概要

### 1.1 目的

orchestrator-hybrid v3.0.0は、**シンプル化**と**実用性**を重視した再設計版。
肥大化した機能を整理し、本当に必要な機能のみを残す。

### 1.2 設計方針

| 方針 | 説明 |
|------|------|
| **コアへの回帰** | Issue → AI → PR の基本フローに集中 |
| **削除 > 追加** | 使われない機能は削除 |
| **シンプルな設定** | 5つ以下のオプションで動作 |
| **実用的な機能** | Worktree環境分離、tmux対応を追加 |

---

## 2. 機能一覧

### 2.1 残す機能

| ID | 機能名 | 説明 | 変更点 |
|----|--------|------|--------|
| F-001 | Issue取得 | GitHub Issueからタスク内容を取得 | 変更なし |
| F-002 | プロンプト生成 | Issue内容からプロンプトを自動生成 | 変更なし |
| F-003 | ループ実行 | `LOOP_COMPLETE`まで反復 | 変更なし |
| F-004 | PR作成 | 完了後にPRを自動作成 | 変更なし |
| F-005 | 承認ゲート | 重要ポイントで人間の承認を要求 | 変更なし |
| F-006 | **Hatシステム** | 役割ベースのプロンプト切り替え | 簡略化 |
| F-007 | **プリセット** | 定義済み設定（simple/tdd） | 変更なし |
| F-008 | ログ監視 | `orch logs --follow` | 変更なし |
| F-009 | ステータスラベル | GitHub Issueにステータス表示 | 変更なし |
| F-010 | **Issue依存関係** | 依存Issueを先に実行 | 変更なし |

### 2.2 新規機能

| ID | 機能名 | 説明 | 優先度 |
|----|--------|------|--------|
| F-011 | **Worktree環境分離** | git worktreeで並列実行環境を完全分離 | 高 |
| F-012 | **tmux統合** | バックエンド実行をtmuxセッションで管理 | 高 |

### 2.3 削除機能

| 機能名 | 削除理由 |
|--------|---------|
| Memories System (F-014) | AIコンテキストで代替可能 |
| Tasks System (F-015) | GitHub Issueで代替可能 |
| Session Recording (F-016) | 使用頻度が低い |
| Multi-Loop Concurrency (F-017) | Worktreeで代替 |
| Custom Backends (F-019) | 使用ケースが限定的 |
| Event Emission CLI (F-020) | 内部処理で十分 |
| Glob Pattern Matching (F-021) | 完全一致で十分 |
| Per-Hat Model Selection (F-013) | 1モデルで十分 |
| Per-Hat Backend (F-018) | 1バックエンドで十分 |
| Container-use統合 (F-202) | Worktreeで代替 |
| 環境状態管理 (F-203) | 過剰な複雑性 |
| 自動クリーンアップ (F-204) | 手動で十分 |

---

## 3. 機能詳細

### 3.1 F-011: Worktree環境分離

#### 概要

git worktreeを使用して、Issue毎に完全に分離されたファイルシステム環境を提供。
Container-useを削除し、よりシンプルなworktreeベースの分離に統一。

#### 処理フロー

```
orch run --issue 42
    │
    ├─[1] worktree作成
    │     git worktree add -b feature/issue-42 .worktrees/issue-42 main
    │
    ├─[2] 環境ファイルコピー
    │     cp .env .envrc .worktrees/issue-42/
    │
    ├─[3] worktree内で実行
    │     cd .worktrees/issue-42 && orch run --in-worktree
    │
    ├─[4] PR作成
    │     gh pr create --head feature/issue-42
    │
    └─[5] マージ後に手動クリーンアップ
          git worktree remove .worktrees/issue-42
```

#### 設定

```yaml
worktree:
  enabled: true                    # worktree分離を有効化
  base_dir: ".worktrees"           # worktree格納ディレクトリ
  copy_files:                      # コピーするファイル
    - ".env"
    - ".envrc"
    - ".env.local"
```

#### CLI

```bash
# 自動的にworktreeを作成して実行
orch run --issue 42

# worktree一覧
orch worktrees

# worktree削除（手動）
orch worktree remove 42
```

#### ビジネスルール

- BR-011-1: worktreeは`.worktrees/issue-<番号>/`に作成
- BR-011-2: ブランチ名は`feature/issue-<番号>`
- BR-011-3: 環境ファイルは自動コピー
- BR-011-4: クリーンアップは手動（`orch worktree remove`）
- **BR-011-5: 実行中のIssueのworktreeは削除不可**（`orch:running`ラベルをチェック）

---

### 3.2 F-012: セッション管理（Session Manager）

#### 概要

Claude Code / OpenCode をバックグラウンドで実行し、以下を実現：
- バックグラウンド実行
- セッションのアタッチ/デタッチ
- 複数セッションの並列監視
- プロセス中断からの復帰

**汎用的な抽象化**により、複数のバックエンド（native/tmux/zellij）に対応。

#### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                   ISessionManager (Interface)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  create(id, command, args) → Session                        │
│  attach(id) → void                                           │
│  getOutput(id, lines?) → string                              │
│  streamOutput(id) → AsyncIterable<string>                   │
│  isRunning(id) → boolean                                     │
│  kill(id) → void                                             │
│  list() → Session[]                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ NativeSession   │  │ TmuxSession     │  │ ZellijSession   │
│ Manager         │  │ Manager         │  │ Manager         │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ Bun.spawn +     │  │ tmux commands   │  │ zellij actions  │
│ file logging    │  │                 │  │                 │
│                 │  │                 │  │                 │
│ 依存: なし      │  │ 依存: tmux      │  │ 依存: zellij    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

#### セッションマネージャー比較

| 実装 | 依存 | attach機能 | 対話性 | 推奨用途 |
|------|------|-----------|--------|---------|
| **native** | なし | tail -f | 読み取りのみ | CI/CD、サーバー |
| **tmux** | tmux | 完全対話 | 完全 | ローカル開発 |
| **zellij** | zellij | 完全対話 | 完全 | モダン環境 |

#### インターフェース定義

```typescript
interface ISessionManager {
  /**
   * セッションを作成して開始
   */
  create(id: string, command: string, args: string[]): Promise<Session>;
  
  /**
   * セッション一覧を取得
   */
  list(): Promise<Session[]>;
  
  /**
   * 出力を取得（最新N行）
   */
  getOutput(id: string, lines?: number): Promise<string>;
  
  /**
   * 出力をリアルタイムでストリーム
   */
  streamOutput(id: string): AsyncIterable<string>;
  
  /**
   * セッションにアタッチ（対話モード）
   */
  attach(id: string): Promise<void>;
  
  /**
   * セッションが実行中か確認
   */
  isRunning(id: string): Promise<boolean>;
  
  /**
   * セッションを終了
   */
  kill(id: string): Promise<void>;
}

interface Session {
  id: string;
  command: string;
  args: string[];
  startedAt: Date;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
  logPath?: string;  // native モードのみ
}
```

#### 実装詳細

##### NativeSessionManager（デフォルト、依存なし）

```
.agent/sessions/
├── issue-42/
│   ├── stdout.log      # 標準出力
│   ├── stderr.log      # 標準エラー  
│   ├── combined.log    # 両方統合
│   ├── meta.json       # セッション情報
│   └── pid             # プロセスID
```

```typescript
// 実装概要
class NativeSessionManager implements ISessionManager {
  async create(id: string, command: string, args: string[]): Promise<Session> {
    const logDir = `.agent/sessions/${id}`;
    const stdout = Bun.file(`${logDir}/stdout.log`).writer();
    const stderr = Bun.file(`${logDir}/stderr.log`).writer();
    
    const proc = Bun.spawn([command, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
    });
    
    // ストリーミングでファイルに書き込み
    this.pipeToFile(proc.stdout, stdout);
    this.pipeToFile(proc.stderr, stderr);
    
    return { id, command, args, status: 'running', ... };
  }
  
  async attach(id: string): Promise<void> {
    // tail -f を実行
    const proc = Bun.spawn(['tail', '-f', `.agent/sessions/${id}/combined.log`], {
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await proc.exited;
  }
}
```

##### TmuxSessionManager

```typescript
class TmuxSessionManager implements ISessionManager {
  async create(id: string, command: string, args: string[]): Promise<Session> {
    const sessionName = `orch-${id}`;
    const fullCommand = [command, ...args].join(' ');
    
    // セッション作成
    await exec('tmux', ['new-session', '-d', '-s', sessionName]);
    
    // コマンド実行
    await exec('tmux', ['send-keys', '-t', sessionName, fullCommand, 'Enter']);
    
    return { id, command, args, status: 'running', ... };
  }
  
  async getOutput(id: string, lines = 1000): Promise<string> {
    const result = await exec('tmux', [
      'capture-pane', '-t', `orch-${id}`, '-p', '-S', `-${lines}`
    ]);
    return result.stdout;
  }
  
  async attach(id: string): Promise<void> {
    // 直接 tmux attach を実行（対話的）
    execSync(`tmux attach -t orch-${id}`, { stdio: 'inherit' });
  }
}
```

##### ZellijSessionManager

```typescript
class ZellijSessionManager implements ISessionManager {
  async create(id: string, command: string, args: string[]): Promise<Session> {
    const sessionName = `orch-${id}`;
    const fullCommand = [command, ...args].join(' ');
    
    // セッション作成してコマンド実行
    await exec('zellij', [
      '-s', sessionName, 
      '--', 'sh', '-c', fullCommand
    ]);
    
    return { id, command, args, status: 'running', ... };
  }
  
  async getOutput(id: string): Promise<string> {
    const tmpFile = `/tmp/orch-${id}-dump.txt`;
    await exec('zellij', ['action', 'dump-screen', tmpFile]);
    return await Bun.file(tmpFile).text();
  }
}
```

#### 自動検出ロジック

```typescript
function detectSessionManager(): ISessionManager {
  // 1. 設定で明示的に指定されている場合はそれを使用
  if (config.session?.manager !== 'auto') {
    return createManager(config.session.manager);
  }
  
  // 2. 自動検出
  if (await commandExists('tmux')) {
    return new TmuxSessionManager();
  }
  
  if (await commandExists('zellij')) {
    return new ZellijSessionManager();
  }
  
  // 3. フォールバック: native（依存なし）
  return new NativeSessionManager();
}
```

#### 設定

```yaml
session:
  # auto | native | tmux | zellij
  manager: auto
  
  # セッション名のプレフィックス
  prefix: "orch"
  
  # 出力キャプチャ間隔（ms）
  capture_interval: 500
  
  # native モード固有設定
  native:
    log_dir: ".agent/sessions"
    max_log_size: "100MB"
```

#### CLI

```bash
# 自動検出されたマネージャーで実行
orch run --issue 42

# 明示的にマネージャーを指定
orch run --issue 42 --session-manager tmux
orch run --issue 42 --session-manager native

# セッション一覧
orch sessions

# セッションにアタッチ
orch attach 42

# セッション終了
orch kill 42
```

#### ビジネスルール

- BR-012-1: デフォルトは自動検出（tmux > zellij > native）
- BR-012-2: セッション名は`orch-<issue番号>`
- BR-012-3: 出力は500ms間隔でキャプチャ
- BR-012-4: `LOOP_COMPLETE`検出でセッション終了
- BR-012-5: エラー時はセッションを保持（デバッグ用）
- BR-012-6: native モードでも基本機能は動作保証

#### エラーハンドリング

| エラー | 対応 |
|--------|------|
| 指定マネージャーが未インストール | native にフォールバック + 警告 |
| セッション作成失敗 | リトライ（最大3回） |
| バックエンド起動失敗 | セッションを保持、エラーログ出力 |
| キャプチャ失敗 | 警告ログ、リトライ |

---

## 4. 設定ファイル

### 4.1 v3.0.0 設定（シンプル版）

```yaml
# orch.yml

# 基本設定
backend: claude              # claude | opencode
auto: true                   # 承認ゲートを自動化
create_pr: true              # 完了後にPR作成
max_iterations: 100          # 最大反復回数

# プリセット（オプション）
preset: tdd                  # simple | tdd

# Worktree環境分離（オプション）
worktree:
  enabled: true
  base_dir: ".worktrees"

# tmux統合（オプション）
tmux:
  enabled: true

# Issue依存関係（オプション）
dependency:
  resolve: true

# ステータスラベル（オプション）
labels:
  enabled: true
  prefix: "orch"
```

### 4.2 プリセット定義

#### simple（デフォルト）

```yaml
# Hatなし、単純ループ
loop:
  completion_promise: "LOOP_COMPLETE"
```

#### tdd

```yaml
# Red → Green → Refactor
hats:
  tester:
    triggers: ["task.start", "code.written"]
    publishes: ["tests.failing", "tests.passing"]
    instructions: |
      テストを書いてください。
      テストが失敗する場合は EVENT: tests.failing を出力。
      テストが通る場合は EVENT: tests.passing を出力。

  implementer:
    triggers: ["tests.failing"]
    publishes: ["code.written"]
    instructions: |
      テストを通すための最小限の実装をしてください。
      完了したら EVENT: code.written を出力。

  refactorer:
    triggers: ["tests.passing"]
    publishes: ["LOOP_COMPLETE"]
    instructions: |
      リファクタリングしてください。
      完了したら LOOP_COMPLETE を出力。
```

---

## 5. CLI

### 5.1 コマンド一覧

| コマンド | 説明 | 例 |
|---------|------|-----|
| `orch run <issue>` | Issue実行 | `orch run 42` |
| `orch status` | 実行状態確認 | `orch status` |
| `orch logs` | ログ確認 | `orch logs --follow` |
| `orch sessions` | tmuxセッション一覧 | `orch sessions` |
| `orch attach <issue>` | セッションにアタッチ | `orch attach 42` |
| `orch kill <issue>` | セッション終了 | `orch kill 42` |
| `orch worktrees` | worktree一覧 | `orch worktrees` |
| `orch worktree remove <issue>` | worktree削除 | `orch worktree remove 42` |
| `orch init` | 設定初期化 | `orch init` |

### 5.2 runコマンドオプション

| オプション | 短縮形 | 説明 | デフォルト |
|-----------|--------|------|-----------|
| `--auto` | `-a` | 承認ゲート自動化 | false |
| `--create-pr` | | PR自動作成 | false |
| `--preset <name>` | `-p` | プリセット使用 | simple |
| `--backend <type>` | `-b` | バックエンド指定 | claude |
| `--max-iterations <n>` | `-m` | 最大反復回数 | 100 |
| `--resolve-deps` | | 依存Issue先行実行 | false |
| `--no-worktree` | | worktree無効化 | false |
| `--no-tmux` | | tmux無効化 | false |

---

## 6. ディレクトリ構成

### 6.1 ソースコード（目標: 20ファイル以下）

```
src/
├── cli.ts                    # エントリーポイント（50行以下）
├── core/
│   ├── loop.ts               # メインループエンジン
│   ├── config.ts             # 設定読み込み
│   ├── types.ts              # 型定義
│   ├── event.ts              # イベントバス
│   ├── hat.ts                # Hatシステム
│   ├── worktree.ts           # Worktree管理（新規）
│   └── tmux.ts               # tmux統合（新規）
├── adapters/
│   ├── base.ts               # バックエンド基底クラス
│   ├── claude.ts             # Claude アダプター
│   └── opencode.ts           # OpenCode アダプター
├── input/
│   ├── github.ts             # Issue取得
│   ├── prompt.ts             # プロンプト生成
│   └── dependency.ts         # Issue依存関係
├── output/
│   ├── pr.ts                 # PR作成
│   └── labels.ts             # ステータスラベル
└── cli/
    └── commands.ts           # CLIコマンド定義
```

### 6.2 ドキュメント（目標: 10ファイル以下）

```
docs/
├── README.md                 # メインドキュメント
├── CONFIGURATION.md          # 設定リファレンス
├── PRESETS.md                # プリセット説明
├── WORKTREE.md               # Worktree使用ガイド
├── TMUX.md                   # tmux統合ガイド
└── MIGRATION-v3.md           # v2.0.0からの移行ガイド
```

---

## 7. 移行計画

### 7.1 Phase 1: 削除（1週間）

- [ ] Memories System削除
- [ ] Tasks System削除
- [ ] Session Recording削除
- [ ] Custom Backends削除
- [ ] Event Emission CLI削除
- [ ] Glob Pattern Matching削除
- [ ] Per-Hat Model/Backend削除
- [ ] Container-use統合削除
- [ ] 環境状態管理削除
- [ ] 自動クリーンアップ削除

### 7.2 Phase 2: リファクタリング（1週間）

- [ ] 型定義の簡略化
- [ ] 設定スキーマの簡略化
- [ ] CLIコマンドの整理
- [ ] テストの整理

### 7.3 Phase 3: 新機能実装（2週間）

- [ ] Worktree環境分離（F-011）
- [ ] tmux統合（F-012）

### 7.4 Phase 4: ドキュメント整理（1週間）

- [ ] 不要ドキュメントの削除
- [ ] 新規ドキュメントの作成
- [ ] README更新

---

## 8. 非機能要件

### 8.1 パフォーマンス

| 要件 | 目標値 |
|------|--------|
| 起動時間 | 100ms以下 |
| tmux出力キャプチャ遅延 | 500ms以下 |
| worktree作成時間 | 3秒以下 |

### 8.2 依存関係

| パッケージ | 用途 | 必須 |
|-----------|------|------|
| commander | CLI | ✅ |
| zod | スキーマ検証 | ✅ |
| chalk | 色付き出力 | ✅ |
| yaml | 設定読み込み | ✅ |

**削除候補**:
- @inquirer/prompts（承認ゲートの対話に使用、シンプル化可能）
- proper-lockfile（Multi-Loop用、削除）

### 8.3 前提条件

| ツール | バージョン | 用途 |
|--------|-----------|------|
| Bun | 1.0+ | ランタイム |
| git | 2.5+ | worktree機能 |
| tmux | 3.0+ | セッション管理 |
| gh | 最新 | GitHub CLI |
| claude/opencode | 最新 | バックエンド |

---

## 9. 期待される効果

| 指標 | v2.0.0 | v3.0.0 | 削減率 |
|------|--------|--------|-------|
| ソースファイル数 | 100+ | 20 | **80%** |
| ドキュメント数 | 91 | 10 | **89%** |
| 設定オプション数 | 50+ | 10 | **80%** |
| 依存パッケージ数 | 10 | 5 | **50%** |
| テストファイル数 | 40+ | 15 | **62%** |

---

## 10. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-28 | 初版作成 | AI Assistant |
