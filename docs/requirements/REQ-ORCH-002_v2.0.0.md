# orchestrator-hybrid v2.0.0 要件定義書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | REQ-ORCH-002 |
| バージョン | 1.0.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-26 |
| 最終更新日 | 2026-01-26 |
| 作成者 | AI Assistant |
| 承認者 | - |

---

## 1. プロジェクト概要

### 1.1 背景

orchestrator-hybrid v1.4.0では、以下の機能を実装済み：

- **v1.2.0**: Docker/Host/Container-use sandbox対応、JSON Schema、改善Issue自動作成
- **v1.3.0**: PR自動マージ、リアルタイムログ監視、Issue依存関係管理、Issueステータスラベル
- **v1.4.0**: Per-Hat Model Selection、Memories System、Tasks System、Session Recording、Multi-Loop Concurrency、Per-Hat Backend、Custom Backends、Event Emission CLI、Glob Pattern Event Matching

しかし、以下の課題が残っている：

1. **CLI設定の煩雑さ**: `--auto --create-pr`等を毎回指定する必要がある
2. **CLIコードの肥大化**: `cli.ts`が1000行を超え、保守性が低下
3. **バックエンド出力の可視性**: AIエージェントの出力がリアルタイムで確認できない
4. **並列実行の制限**: container-use単体ではファイルシステムが共有され、ブランチ競合が発生

### 1.2 目的

v2.0.0では、以下を実現する：

1. **設定ファイルのデフォルト化**: `orch.yml`で`run`設定を定義し、CLIオプションを省略可能に
2. **CLIリファクタリング**: コマンド分離、設定マージロジックの一元化で保守性向上
3. **バックエンド出力のリアルタイムストリーミング**: AIエージェントの出力をリアルタイムで`backend.log`に書き込み
4. **Worktree + Container-Use ハイブリッド環境**: 完全に隔離された並列実行環境の構築

### 1.3 ゴール

| KPI | 目標値 | 測定方法 |
|-----|--------|----------|
| CLI設定の簡略化 | 80%のユーザーがデフォルト設定で実行 | 設定ファイル分析 |
| CLIコードの保守性向上 | 各コマンドファイルが200行以下 | コードメトリクス |
| バックエンド出力の可視性 | 100%のユーザーがリアルタイム監視可能 | ユーザーフィードバック |
| 並列実行の安定性 | ブランチ競合エラー0件 | 統合テスト |

### 1.4 スコープ

#### 対象範囲

- **Phase 1: 基盤改善（優先度: 高）**
  - run設定のデフォルト化（F-101）
  - CLIリファクタリング（F-102）
  - バックエンド出力のリアルタイムストリーミング（F-103）
  - logsコマンド拡張（F-104）

- **Phase 2: 並列実行環境（優先度: 高）**
  - WorktreeManager実装（F-201）
  - Worktree + Container-Use統合（F-202）
  - 環境状態管理（F-203）
  - 自動クリーンアップ（F-204）

#### 対象外

- v1.4.0で実装済みの機能の大幅な変更
- UI/GUIの実装
- 他のバージョン管理システム（Git以外）への対応

---

## 2. ステークホルダー

### 2.1 ステークホルダー一覧

| 役割 | 担当者/部門 | 関心事 | 影響度 |
|------|------------|--------|--------|
| プロダクトオーナー | - | ユーザー体験の向上、機能拡張 | 高 |
| 開発チーム | - | コードの保守性、実装の容易性 | 高 |
| エンドユーザー（開発者） | - | 設定の簡便性、並列実行の安定性 | 高 |

### 2.2 ユーザーペルソナ

#### ペルソナ1: AIエージェント開発者（ヘビーユーザー）

| 項目 | 内容 |
|------|------|
| 属性 | 30代、ソフトウェアエンジニア、AI/MLに精通 |
| 課題 | - 毎回`--auto --create-pr`を指定するのが面倒<br>- 複数Issueを並列実行するとブランチ競合が発生<br>- AIエージェントが何をしているか分からない |
| ニーズ | - デフォルト設定で簡潔に実行<br>- 完全に隔離された並列実行環境<br>- AIエージェントの出力をリアルタイムで確認 |
| 利用シーン | 複数のIssueを同時に処理、長時間実行の監視 |

---

## 3. 機能要件

### 3.1 機能一覧

#### Phase 1: 基盤改善（優先度: 高）

| ID | 機能名 | 概要 | 優先度 | 工数 |
|----|--------|------|--------|------|
| F-101 | run設定デフォルト化 | `orch.yml`で`--auto`, `--create-pr`等をデフォルト設定可能に | 必須 | 2h |
| F-102 | CLIリファクタリング | `cli.ts`を`commands/`に分離、`config-merger`実装 | 必須 | 6h |
| F-103 | バックエンド出力ストリーミング | AIエージェント出力をリアルタイムで`backend.log`に書き込み | 必須 | 10h |
| F-104 | logsコマンド拡張 | `--source backend`でAIエージェント出力を監視 | 必須 | 2h |

#### Phase 2: 並列実行環境（優先度: 高）

| ID | 機能名 | 概要 | 優先度 | 工数 |
|----|--------|------|--------|------|
| F-201 | WorktreeManager | git worktreeの作成/削除/一覧管理 | 必須 | 6h |
| F-202 | Worktree + Container-Use統合 | ハイブリッド環境の自動構築 | 必須 | 4h |
| F-203 | 環境状態管理 | GitHub Issueラベル/メタデータで環境状態を追跡 | 必須 | 3h |
| F-204 | 自動クリーンアップ | マージ後にworktree + container-use環境を削除 | 必須 | 2h |

### 3.2 ユーザーストーリー

#### US-101: run設定のデフォルト化

- **ユーザー**: AIエージェント開発者
- **したいこと**: `orch.yml`で`--auto --create-pr`をデフォルト設定したい
- **理由**: 毎回同じオプションを指定するのが面倒だから
- **受け入れ基準**:
  - [ ] `orch.yml`に`run.auto_mode: true`を設定できる
  - [ ] `run.create_pr: true`を設定できる
  - [ ] `run.draft_pr: false`を設定できる
  - [ ] CLIオプションが設定ファイルより優先される
- **関連機能**: F-101

#### US-102: CLIコマンドの分離

- **ユーザー**: 開発者（コントリビューター）
- **したいこと**: `cli.ts`を読みやすく、保守しやすくしたい
- **理由**: 現在1000行を超えており、変更が困難だから
- **受け入れ基準**:
  - [ ] `src/cli/commands/run.ts`にrunコマンドが分離されている
  - [ ] `src/cli/commands/init.ts`にinitコマンドが分離されている
  - [ ] `src/cli/commands/logs.ts`にlogsコマンドが分離されている
  - [ ] 各コマンドファイルが200行以下
- **関連機能**: F-102

#### US-103: バックエンド出力のリアルタイム確認

- **ユーザー**: AIエージェント開発者
- **したいこと**: AIエージェントが何をしているかリアルタイムで確認したい
- **理由**: 長時間実行時に進捗が分からず不安だから
- **受け入れ基準**:
  - [ ] `.agent/<task-id>/backend.log`にAIエージェント出力が書き込まれる
  - [ ] `orch logs --task <id> --follow --source backend`でリアルタイム監視できる
  - [ ] 出力は500ms以内に反映される
  - [ ] ログファイルは100MB上限でローテーション
- **関連機能**: F-103, F-104

#### US-201: 完全に隔離された並列実行

- **ユーザー**: AIエージェント開発者
- **したいこと**: 複数のIssueを完全に隔離された環境で並列実行したい
- **理由**: container-use単体ではブランチ競合が発生するから
- **受け入れ基準**:
  - [ ] `orch run --issue 42 --auto`を実行すると`.worktrees/issue-42/`が作成される
  - [ ] 2つ目のIssueは`.worktrees/issue-43/`に分離される
  - [ ] 各worktreeで独立したcontainer-use環境が作成される
  - [ ] ブランチ競合エラーが発生しない
- **関連機能**: F-201, F-202

#### US-202: 環境状態の可視化

- **ユーザー**: AIエージェント開発者
- **したいこと**: GitHub Issue上で環境の状態を確認したい
- **理由**: どのIssueがどの環境で実行中か把握したいから
- **受け入れ基準**:
  - [ ] Issue #42に`env:active`ラベルが付与される
  - [ ] Issueメタデータに`worktree_path`が記録される
  - [ ] Issueメタデータに`container_id`が記録される
  - [ ] マージ後に`env:merged`ラベルに変更される
- **関連機能**: F-203

#### US-203: 自動クリーンアップ

- **ユーザー**: AIエージェント開発者
- **したいこと**: マージ後に環境を自動的にクリーンアップしたい
- **理由**: 手動で削除するのが面倒だから
- **受け入れ基準**:
  - [ ] PR #42がマージされると`.worktrees/issue-42/`が削除される
  - [ ] container-use環境も自動削除される
  - [ ] ブランチ`feature/issue-42`も削除される（`delete_branch: true`時）
  - [ ] `worktree.auto_cleanup: false`で無効化できる
- **関連機能**: F-204

### 3.3 機能詳細

#### F-101: run設定デフォルト化

**概要**: `orch.yml`で`run`設定を定義し、CLIオプションを省略可能にする

**入力**:
- `orch.yml`の`run`セクション

**出力**:
- デフォルト設定が適用された実行

**処理概要**:
1. `orch.yml`から`run`セクションを読み込み
2. CLIオプションが指定されていない場合、設定ファイルの値を使用
3. CLIオプションが指定されている場合、CLIオプションを優先

**YAML設定例**:
```yaml
run:
  auto_mode: true       # --auto のデフォルト
  create_pr: true       # --create-pr のデフォルト
  draft_pr: false       # --draft のデフォルト
```

**ビジネスルール**:
- BR-101: CLIオプションが設定ファイルより優先される
- BR-102: `run`セクションが未定義の場合、既存のデフォルト値を使用
- BR-103: 矛盾する設定（`auto_mode: false` + `--auto`）はCLIオプションを優先

**制約事項**:
- `run`セクションは`orch.yml`のトップレベルに配置

---

#### F-102: CLIリファクタリング

**概要**: `cli.ts`を`commands/`に分離し、設定マージロジックを一元化

**入力**:
- なし（リファクタリング）

**出力**:
- 分離されたコマンドファイル
- `config-merger.ts`

**処理概要**:
1. `cli.ts`から各コマンドを`src/cli/commands/`に分離
2. `src/cli/config-merger.ts`で設定マージロジックを実装
3. `src/cli/options.ts`でオプション定義を集約

**ファイル構成**:
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

**ビジネスルール**:
- BR-104: 各コマンドファイルは200行以下に保つ
- BR-105: `config-merger.ts`で設定の優先順位を一元管理（CLI > 設定ファイル > デフォルト）
- BR-106: 矛盾するオプション（`--resolve-deps` + `--ignore-deps`）を検出してエラー

**制約事項**:
- 既存のCLIインターフェースを変更しない（後方互換性）

---

#### F-103: バックエンド出力のリアルタイムストリーミング

**概要**: AIエージェント（claude/opencode）の出力をリアルタイムで`backend.log`に書き込む

**入力**:
- バックエンド（claude/opencode）の標準出力/標準エラー出力

**出力**:
- `.agent/<task-id>/backend.log`

**処理概要**:
1. `src/core/exec.ts`にストリーミング対応を追加
2. バックエンドアダプター（`claude.ts`, `opencode.ts`）で`logFile`オプションを使用
3. `Bun.spawn`のstdout/stderrをストリーミングで読み取り
4. 各チャンクを即座に`backend.log`に書き込み

**実装例**:
```typescript
// src/core/exec.ts
export interface ExecOptions {
  reject?: boolean;
  onStdout?: (chunk: string) => void;  // 新規
  onStderr?: (chunk: string) => void;  // 新規
  logFile?: string;                     // 新規
}

export async function exec(
  cmd: string,
  args: string[],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const { reject = true, onStdout, onStderr, logFile } = options;

  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  let stdout = "";
  let stderr = "";

  const logWriter = logFile ? Bun.file(logFile).writer() : null;

  // stdoutのストリーミング処理
  const stdoutReader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await stdoutReader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    stdout += chunk;
    
    onStdout?.(chunk);
    
    if (logWriter) {
      logWriter.write(value);
      logWriter.flush();
    }
  }

  // stderr処理（同様）
  // ...

  if (logWriter) {
    await logWriter.end();
  }

  const exitCode = await proc.exited;

  if (reject && exitCode !== 0) {
    throw new Error(`Command failed with exit code ${exitCode}: ${stderr || stdout}`);
  }

  return { stdout, exitCode };
}
```

**ログディレクトリ構成**:
```
.agent/
├── task-1234567890-42/
│   ├── task.log           # orchestrator-hybridのログ（既存）
│   ├── backend.log        # バックエンド出力（新規）
│   └── events.jsonl       # イベント履歴
```

**ビジネスルール**:
- BR-107: ログファイルは100MB上限でローテーション
- BR-108: 出力は500ms以内に反映される
- BR-109: ANSIエスケープシーケンスはそのまま保存（フィルタリングしない）

**制約事項**:
- ログファイルのサイズ上限は設定可能（デフォルト: 100MB）

---

#### F-104: logsコマンド拡張

**概要**: `orch logs`コマンドに`--source backend`オプションを追加し、バックエンド出力を監視可能にする

**入力**:
- `--source` オプション（`backend` | `orch` | `all`）

**出力**:
- 指定されたソースのログ出力

**処理概要**:
1. `--source backend`指定時は`.agent/<task-id>/backend.log`を監視
2. `--source orch`指定時は`.agent/<task-id>/task.log`を監視
3. `--source all`（デフォルト）は両方を監視

**CLI使用例**:
```bash
# バックエンド出力をリアルタイム監視
orch logs --task <id> --follow --source backend

# orchestratorログを監視
orch logs --task <id> --follow --source orch

# 両方を監視（デフォルト）
orch logs --task <id> --follow --source all
```

**ビジネスルール**:
- BR-110: `--source`のデフォルトは`all`
- BR-111: `--source all`時は出力元を識別するプレフィックスを付与（`[backend]`, `[orch]`）
- BR-112: ログファイルが存在しない場合はエラーを出力

**制約事項**:
- なし

---

#### F-201: WorktreeManager

**概要**: git worktreeの作成/削除/一覧管理を行うマネージャークラス

**入力**:
- Issue番号
- ベースブランチ（デフォルト: `main`）

**出力**:
- worktreeパス（`.worktrees/issue-<番号>/`）

**処理概要**:
1. `git worktree add -b feature/issue-<番号> .worktrees/issue-<番号> main`でworktree作成
2. `.env`, `.envrc`等の環境ファイルをコピー
3. worktree一覧を`.orch/worktrees.json`で管理
4. 削除時は`git worktree remove .worktrees/issue-<番号>`を実行

**クラス定義**:
```typescript
// src/adapters/worktree-manager.ts

export interface WorktreeConfig {
  /**
   * worktree格納ディレクトリ
   */
  baseDir: string;

  /**
   * マージ後に自動削除するか
   */
  autoCleanup: boolean;

  /**
   * コピーする環境ファイル
   */
  copyEnvFiles: string[];
}

export class WorktreeManager {
  private readonly config: WorktreeConfig;
  private readonly executor: ProcessExecutor;

  constructor(
    config: WorktreeConfig,
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;
  }

  /**
   * worktreeを作成
   * 
   * @param issueNumber - Issue番号
   * @param baseBranch - ベースブランチ（デフォルト: main）
   * @returns worktreeパス
   */
  async create(issueNumber: number, baseBranch = "main"): Promise<string> {
    const worktreePath = join(this.config.baseDir, `issue-${issueNumber}`);
    const branchName = `feature/issue-${issueNumber}`;

    // worktree作成
    await this.executor.spawn("git", [
      "worktree",
      "add",
      "-b",
      branchName,
      worktreePath,
      baseBranch,
    ]);

    // 環境ファイルをコピー
    for (const file of this.config.copyEnvFiles) {
      if (await Bun.file(file).exists()) {
        await Bun.write(join(worktreePath, file), Bun.file(file));
      }
    }

    return worktreePath;
  }

  /**
   * worktreeを削除
   * 
   * @param issueNumber - Issue番号
   */
  async remove(issueNumber: number): Promise<void> {
    const worktreePath = join(this.config.baseDir, `issue-${issueNumber}`);

    await this.executor.spawn("git", ["worktree", "remove", worktreePath]);
  }

  /**
   * worktree一覧を取得
   * 
   * @returns worktreeパスの配列
   */
  async list(): Promise<string[]> {
    const result = await this.executor.spawn("git", ["worktree", "list", "--porcelain"]);
    
    // パース処理
    const worktrees: string[] = [];
    const lines = result.stdout.split("\n");
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        worktrees.push(line.replace("worktree ", ""));
      }
    }

    return worktrees;
  }
}
```

**ビジネスルール**:
- BR-201: worktreeは`.worktrees/issue-<番号>/`に作成
- BR-202: ブランチ名は`feature/issue-<番号>`
- BR-203: `.env`, `.envrc`, `.env.local`を自動コピー
- BR-204: worktree一覧は`.orch/worktrees.json`で管理

**制約事項**:
- git 2.5以上が必要

---

#### F-202: Worktree + Container-Use統合

**概要**: worktree作成後、そのディレクトリをcontainer-use環境のソースとして使用

**入力**:
- Issue番号
- worktreeパス

**出力**:
- container-use環境ID

**処理概要**:
1. `WorktreeManager.create()`でworktree作成
2. container-use環境を作成（`environment_source = worktreePath`）
3. worktreeパスとcontainer-use環境IDを`.orch/worktrees.json`に記録

**設定ファイル例**:
```yaml
worktree:
  enabled: true
  base_dir: ".worktrees"
  auto_cleanup: true
  copy_env_files:
    - ".env"
    - ".envrc"
    - ".env.local"

container:
  enabled: true
  image: node:20
```

**実行フロー**:
```
orch run --issue 42 --auto --create-pr
    │
    ├─[1] worktree作成
    │     git worktree add -b feature/issue-42 .worktrees/issue-42 main
    │     cp .env .worktrees/issue-42/
    │
    ├─[2] container-use環境作成
    │     environment_source = ".worktrees/issue-42"
    │     title = "Issue #42"
    │
    ├─[3] 実装ループ
    │     AIエージェントがcontainer-use内で作業
    │
    ├─[4] PR作成
    │     gh pr create --head feature/issue-42
    │
    ├─[5] 自動マージ（auto_merge: true時）
    │
    └─[6] クリーンアップ
          container-use環境削除
          git worktree remove .worktrees/issue-42
          git branch -d feature/issue-42
```

**ビジネスルール**:
- BR-205: worktree + container-use両方有効時はハイブリッド環境を構築
- BR-206: worktree単体でも動作可能（container.enabled: false）
- BR-207: container-use単体でも動作可能（worktree.enabled: false）
- BR-208: 両方無効時は既存の動作（in-place実行）

**制約事項**:
- container-use CLIがインストールされている必要がある

---

#### F-203: 環境状態管理

**概要**: GitHub Issueラベル/メタデータで環境状態を追跡

**入力**:
- Issue番号
- 環境状態（active/worktree/container-id/pr-created/merged）

**出力**:
- GitHub Issueラベル/メタデータ

**処理概要**:
1. worktree作成時に`env:active`ラベルを付与
2. Issueメタデータに`worktree_path`を記録
3. container-use環境作成時に`container_id`を記録
4. PR作成時に`env:pr-created`ラベルを付与
5. マージ時に`env:merged`ラベルに変更

**ラベル体系**:

| ラベル | 説明 | 色 |
|--------|------|-----|
| `env:active` | worktree + container-use環境が存在 | 🟢 緑 |
| `env:pr-created` | PR作成済み | 🟣 紫 |
| `env:merged` | マージ完了（クリーンアップ待ち） | 🔵 青 |

**メタデータ例**:
```json
{
  "worktree_path": ".worktrees/issue-42",
  "container_id": "abc-123",
  "branch": "feature/issue-42",
  "pr_number": 42
}
```

**ビジネスルール**:
- BR-209: ラベルは排他的（`env:active` → `env:pr-created` → `env:merged`）
- BR-210: メタデータはIssue本文の`<!-- metadata -->`コメントに記録
- BR-211: `env:merged`ラベル付与後、自動クリーンアップを実行

**制約事項**:
- GitHub APIへのアクセス権限が必要

---

#### F-204: 自動クリーンアップ

**概要**: マージ後にworktree + container-use環境を自動削除

**入力**:
- Issue番号
- PR番号

**出力**:
- クリーンアップ完了メッセージ

**処理概要**:
1. PR #42がマージされたことを検出
2. `.orch/worktrees.json`から環境情報を取得
3. container-use環境を削除（`cu env delete <env-id>`）
4. worktreeを削除（`git worktree remove .worktrees/issue-42`）
5. ブランチを削除（`git branch -d feature/issue-42`）
6. Issueラベルを`env:merged`に変更

**設定ファイル例**:
```yaml
worktree:
  auto_cleanup: true  # デフォルト: true
```

**ビジネスルール**:
- BR-212: `auto_cleanup: true`時のみ自動削除
- BR-213: `auto_cleanup: false`時は手動削除が必要
- BR-214: クリーンアップ失敗時はエラーログを出力（処理は継続）

**制約事項**:
- なし

---

## 4. 非機能要件

### 4.1 性能要件

| ID | 要件 | 目標値 | 測定方法 |
|----|------|--------|----------|
| NFR-P-101 | 設定ファイル読み込み時間 | 50ms以内 | ユニットテスト |
| NFR-P-102 | バックエンド出力の遅延 | 500ms以内 | 統合テスト |
| NFR-P-103 | worktree作成時間 | 5秒以内 | 統合テスト |
| NFR-P-104 | container-use環境作成時間 | 30秒以内 | 統合テスト |

### 4.2 セキュリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-S-101 | 環境ファイルの保護 | `.env`等の機密情報をworktreeにコピー時、パーミッション維持 |
| NFR-S-102 | ログファイルの保護 | `backend.log`に機密情報が含まれる可能性を警告 |

### 4.3 保守性要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-M-101 | コードの可読性 | 各コマンドファイルは200行以下 |
| NFR-M-102 | テストカバレッジ | 新規コードは80%以上 |
| NFR-M-103 | ドキュメント | 各機能にREADME更新 |

---

## 5. 制約条件

### 5.1 技術的制約

| 制約 | 詳細 | 理由 |
|------|------|------|
| Bun 1.0以上 | ランタイム | 既存プロジェクトの依存 |
| git 2.5以上 | worktree機能 | worktree機能の要件 |
| container-use CLI | 環境分離 | 既存機能の依存 |

### 5.2 ビジネス制約

| 制約 | 詳細 |
|------|------|
| 後方互換性 | 既存のCLIインターフェースを変更しない |
| 段階的リリース | Phase 1 → Phase 2の順で実装 |

---

## 6. リスクと課題

### 6.1 リスク一覧

| ID | リスク | 影響度 | 発生確率 | 対策 |
|----|--------|--------|---------|------|
| R-101 | CLIリファクタリングでバグ混入 | 高 | 中 | 既存テストの維持、段階的リファクタリング |
| R-102 | worktree + container-use統合の複雑性 | 中 | 高 | プロトタイプ実装、十分なテスト |
| R-103 | バックエンド出力のログサイズ肥大化 | 中 | 中 | ローテーション機能、サイズ上限設定 |

### 6.2 未解決課題

| ID | 課題 | 担当 | 期限 |
|----|------|------|------|
| I-101 | worktree削除時のコンフリクト処理 | - | Phase 2実装前 |
| I-102 | 複数worktreeの同時マージ順序 | - | Phase 2実装前 |

---

## 7. 用語集

| 用語 | 定義 |
|------|------|
| worktree | git worktree機能。同一リポジトリの複数ブランチを別ディレクトリで管理 |
| ハイブリッド環境 | worktree（ファイルシステム分離）+ container-use（環境分離）の組み合わせ |
| ストリーミング | データを逐次的に処理・転送する方式 |
| config-merger | CLI/設定ファイル/デフォルト値を統合するロジック |

---

## 8. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-26 | 初版作成 | AI Assistant |

---

## 9. 関連ドキュメント

| ドキュメント | 説明 |
|-------------|------|
| REQ-ORCH-001_追加仕様.md | v1.4.0要件定義書 |
| BASIC-ORCH-002_v1.3.0機能.md | v1.3.0基本設計書 |
| docs/memos/run設定のデフォルト化とリファクタリング.md | Phase 1メモ |
| docs/memos/worktree-container-use-hybrid.md | Phase 2メモ |
| docs/memos/バックエンド出力のリアルタイムストリーミング.md | Phase 1メモ |

---

## 10. v1.4.0との関連性

v2.0.0は、v1.4.0の追加仕様に対して以下の改善を行う：

| v1.4.0機能 | v2.0.0改善 |
|-----------|-----------|
| Per-Hat Model Selection（F-013） | 設定ファイルでデフォルト化（F-101） |
| Multi-Loop Concurrency（F-017） | worktree + container-useハイブリッド環境で完全分離（F-201, F-202） |
| Session Recording（F-016） | バックエンド出力のリアルタイムストリーミング（F-103） |
| Memories System（F-014） | 変更なし（既存機能を継承） |
| Tasks System（F-015） | 変更なし（既存機能を継承） |

v2.0.0は、v1.4.0の機能を基盤として、**ユーザー体験の向上**と**並列実行の安定性向上**に焦点を当てた改善を行う。
