# orchestrator-hybrid v1.3.0機能 基本設計書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | BASIC-ORCH-002 |
| バージョン | 1.0.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-25 |
| 最終更新日 | 2026-01-25 |
| 作成者 | AI Assistant |
| 承認者 | - |
| 関連要件定義書 | REQ-ORCH-001 v1.3.0 |
| 関連基本設計書 | BASIC-ORCH-001 v1.0.0 (Phase 1-2) |

---

## 1. 概要

### 1.1 目的

orchestrator-hybrid v1.3.0（Phase 3）として、以下の機能を追加し、完全自動化ワークフローを実現する：

1. **PR自動マージ機能（F-009）**: CI成功後にPRを自動マージ
2. **リアルタイムログ監視機能（F-010）**: 別ターミナルから実行中タスクのログを監視
3. **Issue依存関係管理機能（F-011）**: Issue間の依存関係を管理し、依存順に実行
4. **Issueステータスラベル機能（F-012）**: GitHub Issueラベルでタスク状態を管理

### 1.2 背景

Phase 1-2（v1.2.0）で以下の機能を実装済み：

- Docker/Host/Container-use sandbox対応（F-001~F-003）
- JSON Schema対応（F-004~F-005）
- 改善Issue自動作成（F-006~F-007）
- 実行ログリアルタイム確認（F-008）

しかし、以下の課題が残っている：

- PR作成後、手動でCIを監視してマージする必要がある
- 実行中のタスクログを別ターミナルから確認できない（同一ターミナルのみ）
- Issue間の依存関係を手動で管理する必要がある
- GitHub上でタスクの実行状況が一目で分からない

### 1.3 スコープ

#### スコープ内

- PR自動マージ機能（F-009）
- リアルタイムログ監視機能（F-010）
- Issue依存関係管理機能（F-011）
- Issueステータスラベル機能（F-012）

#### スコープ外

- PR自動作成機能（既存機能で実装済み）
- CI設定の自動生成
- 依存関係グラフの可視化UI
- ラベル体系の完全カスタマイズ（プレフィックスのみ対応）

### 1.4 用語定義

| 用語 | 定義 |
|------|------|
| PR自動マージ | CI成功後にPRを自動的にマージする機能 |
| CI監視 | GitHub ActionsなどのCI実行状況を監視すること |
| トポロジカルソート | 依存関係を考慮した順序付けアルゴリズム |
| 循環依存 | Issue A → B → A のように依存関係がループする状態 |
| squash merge | 複数のコミットを1つにまとめてマージする方式 |
| Issue Dependencies API | GitHub Issue間の依存関係を管理するAPI |

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Hybrid v1.3.0                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │  Input   │───▶│  Loop    │───▶│  Output  │                  │
│  │  Layer   │    │  Engine  │    │  Layer   │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│       │              │  ▲            │                          │
│       ▼              ▼  │            ▼                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                  │
│  │  GitHub  │    │   Hat    │    │   PR     │                  │
│  │  Issue   │    │  System  │    │ Creation │                  │
│  └──────────┘    └──────────┘    └──────────┘                  │
│       │              │                │                         │
│       │              │                ▼                         │
│       │              │         ┌──────────────┐                 │
│       │              │         │ PRAutoMerger │ ← 新規 (F-009) │
│       │              │         └──────────────┘                 │
│       │              │                                          │
│       ▼              ▼                                          │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Issue Dependency Management (新規 F-011)        │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Issue      │  │  Dependency  │  │ Topological  │   │   │
│  │  │ Dependencies │  │   Resolver   │  │    Sort      │   │   │
│  │  │     API      │  │              │  │              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Issue Status Label Management (新規 F-012)      │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Label      │  │    Label     │  │   GitHub     │   │   │
│  │  │   Manager    │  │   Updater    │  │   Labels     │   │   │
│  │  │              │  │              │  │     API      │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Logging System (拡張 F-010)                 │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │  Console     │  │     Log      │  │     Log      │   │   │
│  │  │   Logger     │  │   Writer     │  │  Streamer    │   │   │
│  │  │   (既存)     │  │  (v1.2.0)    │  │  (v1.2.0)    │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                           │                 │           │   │
│  │                           ▼                 ▼           │   │
│  │                    .agent/<task-id>/                    │   │
│  │                    ├── output.log                       │   │
│  │                    ├── stdout.log                       │   │
│  │                    └── stderr.log                       │   │
│  │                                                          │   │
│  │  ┌──────────────────────────────────────────────────┐   │   │
│  │  │  Log Monitor (新規 F-010)                        │   │   │
│  │  │  - fs.watch() または polling                     │   │   │
│  │  │  - 別プロセスから監視可能                         │   │   │
│  │  └──────────────────────────────────────────────────┘   │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技術スタック

| レイヤー | 技術 | バージョン | 備考 |
|---------|------|-----------|------|
| **ランタイム** | Bun | 1.0以上 | 既存 |
| **言語** | TypeScript | 5.0以上 | strict mode |
| **GitHub CLI** | gh | 最新 | PR操作、Issue Dependencies API |
| **ログ監視** | fs.watch() / polling | - | Node.js標準API（Bunで利用可能） |
| **依存関係解析** | 独自実装 | - | トポロジカルソート |
| **ラベル管理** | GitHub REST API | - | gh CLI経由 |

#### 技術選定理由

| 技術 | 選定理由 |
|------|---------|
| gh CLI | GitHub APIの公式CLI。認証管理が容易、PR/Issue操作が簡潔 |
| fs.watch() | Node.js標準API。ファイル変更をリアルタイムで検出可能 |
| GitHub Issue Dependencies API | 2025年8月GA。公式の依存関係管理機能 |
| トポロジカルソート | 依存関係を考慮した実行順序を決定するアルゴリズム |

### 2.3 外部システム連携

```
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator Hybrid v1.3.0                  │
└─────────────────────────────────────────────────────────────┘
                     │                    │
                     ▼                    ▼
         ┌──────────────────┐  ┌──────────────────┐
         │   GitHub API     │  │   GitHub CLI     │
         │   (F-011, F-012) │  │   (F-009, F-010) │
         └──────────────────┘  └──────────────────┘
                 │                      │
                 ▼                      ▼
         ┌──────────────────┐  ┌──────────────────┐
         │  Issue           │  │   gh pr          │
         │  Dependencies    │  │   - checks       │
         │  API             │  │   - merge        │
         │  - blocked_by    │  │                  │
         │  - blocking      │  │   gh issue       │
         │                  │  │   - edit         │
         └──────────────────┘  └──────────────────┘
```

---

## 3. モジュール設計

### 3.1 PRAutoMerger（F-009）

#### 目的

PR作成後、CIが成功したら自動的にマージする機能を提供。

#### クラス定義

```typescript
// src/output/pr-auto-merger.ts

export interface PRAutoMergerConfig {
  /**
   * 自動マージを有効にするか
   */
  enabled: boolean;

  /**
   * マージ方式
   * - squash: コミットをまとめてマージ（推奨）
   * - merge: マージコミットを作成
   * - rebase: リベースしてマージ
   */
  mergeMethod: "squash" | "merge" | "rebase";

  /**
   * マージ後にブランチを削除するか
   */
  deleteBranch: boolean;

  /**
   * CIタイムアウト（秒）
   */
  ciTimeoutSecs: number;
}

export class PRAutoMerger {
  private readonly config: PRAutoMergerConfig;
  private readonly executor: ProcessExecutor;

  constructor(
    config: PRAutoMergerConfig,
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;
  }

  /**
   * PR作成後、CI成功時に自動マージ
   * 
   * @param prNumber - PR番号
   * @returns マージ成功時はtrue、失敗時はfalse
   * @throws PRAutoMergeError - CI失敗、タイムアウト時
   */
  async autoMerge(prNumber: number): Promise<boolean> {
    if (!this.config.enabled) {
      logger.info("PR自動マージは無効です");
      return false;
    }

    logger.info(`PR #${prNumber} のCI完了を待機中...`);

    // CI完了を待機
    const ciSuccess = await this.waitForCI(prNumber);

    if (!ciSuccess) {
      throw new PRAutoMergeError(
        `PR #${prNumber} のCI失敗。マージを中断します。`,
        { prNumber }
      );
    }

    // マージ実行
    await this.merge(prNumber);

    logger.success(`PR #${prNumber} を自動マージしました`);
    return true;
  }

  /**
   * CIの完了を待機
   * 
   * @param prNumber - PR番号
   * @returns CI成功時はtrue、失敗時はfalse
   * @throws PRAutoMergeError - タイムアウト時
   */
  private async waitForCI(prNumber: number): Promise<boolean> {
    const result = await this.executor.spawn(
      "gh",
      ["pr", "checks", String(prNumber), "--watch"],
      {
        timeout: this.config.ciTimeoutSecs * 1000,
      }
    );

    if (result.exitCode === 0) {
      return true; // CI成功
    }

    // タイムアウトまたはCI失敗
    const isTimeout = result.stderr.includes("timeout");
    if (isTimeout) {
      throw new PRAutoMergeError(
        `PR #${prNumber} のCIがタイムアウトしました（${this.config.ciTimeoutSecs}秒）`,
        { prNumber, timeout: this.config.ciTimeoutSecs }
      );
    }

    return false; // CI失敗
  }

  /**
   * PRをマージ
   * 
   * @param prNumber - PR番号
   */
  private async merge(prNumber: number): Promise<void> {
    const args = [
      "pr",
      "merge",
      String(prNumber),
      `--${this.config.mergeMethod}`,
    ];

    if (this.config.deleteBranch) {
      args.push("--delete-branch");
    }

    const result = await this.executor.spawn("gh", args);

    if (result.exitCode !== 0) {
      throw new PRAutoMergeError(
        `PR #${prNumber} のマージに失敗: ${result.stderr}`,
        { prNumber, stderr: result.stderr }
      );
    }
  }
}
```

#### 設定ファイル拡張

```yaml
# orch.yml に追加
pr:
  auto_merge: true
  merge_method: squash  # squash | merge | rebase
  delete_branch: true
  ci_timeout_secs: 600  # 10分
```

#### TypeScript型定義拡張

```typescript
// src/core/types.ts に追加

export const PRConfigSchema = z.object({
  /**
   * PR自動マージを有効にするか
   */
  autoMerge: z.boolean().default(false),

  /**
   * マージ方式
   */
  mergeMethod: z.enum(["squash", "merge", "rebase"]).default("squash"),

  /**
   * マージ後にブランチを削除するか
   */
  deleteBranch: z.boolean().default(true),

  /**
   * CIタイムアウト（秒）
   */
  ciTimeoutSecs: z.number().default(600),
});

export type PRConfig = z.infer<typeof PRConfigSchema>;

// ConfigSchema に追加
export const ConfigSchema = z.object({
  // ... 既存フィールド

  // 新規: PR設定
  pr: PRConfigSchema.optional(),
});
```

---

### 3.2 LogMonitor（F-010）

#### 目的

別ターミナルから実行中タスクのログをリアルタイムで監視する機能を提供。

#### クラス定義

```typescript
// src/core/log-monitor.ts

export interface LogMonitorConfig {
  /**
   * タスクID
   */
  taskId: string;

  /**
   * ログディレクトリのベースパス
   */
  baseDir?: string;

  /**
   * ポーリング間隔（ミリ秒）
   * fs.watch()が使えない場合のフォールバック
   */
  pollInterval?: number;
}

export class LogMonitor {
  private readonly taskId: string;
  private readonly logPath: string;
  private readonly pollInterval: number;
  private abortController: AbortController | null = null;
  private lastSize = 0;

  constructor(config: LogMonitorConfig) {
    this.taskId = config.taskId;
    this.logPath = join(
      config.baseDir ?? ".agent",
      config.taskId,
      "output.log"
    );
    this.pollInterval = config.pollInterval ?? 500; // 500ms
  }

  /**
   * ログファイルをリアルタイムで監視
   * 
   * @param callback - 新しい行が追加されたときに呼ばれる関数
   * @throws LogMonitorError - ログファイルが存在しない場合
   */
  async monitor(callback: (line: string) => void): Promise<void> {
    // ファイルの存在確認
    const file = Bun.file(this.logPath);
    if (!(await file.exists())) {
      throw new LogMonitorError(
        `ログファイルが見つかりません: ${this.logPath}`,
        { taskId: this.taskId, logPath: this.logPath }
      );
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // fs.watch() を試行（Bunで利用可能）
    try {
      await this.monitorWithWatch(callback, signal);
    } catch (error) {
      // fs.watch() が使えない場合はpollingにフォールバック
      logger.warn("fs.watch() が使えません。pollingモードで監視します。");
      await this.monitorWithPolling(callback, signal);
    }
  }

  /**
   * fs.watch() を使用した監視
   */
  private async monitorWithWatch(
    callback: (line: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const watcher = fs.watch(this.logPath, { signal });

    for await (const event of watcher) {
      if (signal.aborted) {
        break;
      }

      if (event.eventType === "change") {
        await this.readNewLines(callback);
      }
    }
  }

  /**
   * polling を使用した監視
   */
  private async monitorWithPolling(
    callback: (line: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    while (!signal.aborted) {
      await this.readNewLines(callback);
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
  }

  /**
   * 新しい行を読み取り
   */
  private async readNewLines(callback: (line: string) => void): Promise<void> {
    const file = Bun.file(this.logPath);
    const currentSize = file.size;

    if (currentSize > this.lastSize) {
      // 新しいデータを読み取る
      const content = await file.text();
      const newContent = content.slice(this.lastSize);
      const lines = newContent.split("\n");

      for (const line of lines) {
        if (line) {
          callback(line);
        }
      }

      this.lastSize = currentSize;
    }
  }

  /**
   * 監視を停止
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}
```

#### CLI統合

```typescript
// src/cli.ts に追加

program
  .command("logs")
  .description("タスクの実行ログを表示")
  .option("-t, --task <id>", "タスクID")
  .option("-f, --follow", "リアルタイムで監視")
  .option("-n, --lines <number>", "表示する行数", "100")
  .option("--table", "タスク状態テーブルを表示（レガシーモード）")
  .option("--interval <ms>", "テーブルモードの更新間隔", "1000")
  .action(async (options) => {
    // --table モード（既存機能）
    if (options.table) {
      // 既存のテーブル表示ロジック
      return;
    }

    // --task モード（新規機能）
    const taskId = options.task ?? await selectLatestTask();

    if (options.follow) {
      // リアルタイム監視
      const monitor = new LogMonitor({ taskId });

      try {
        await monitor.monitor((line) => {
          console.log(line);
        });
      } catch (error) {
        logger.error(`ログ監視エラー: ${error.message}`);
        process.exit(1);
      }

      // Ctrl+Cで終了
      process.on("SIGINT", () => {
        monitor.stop();
        process.exit(0);
      });
    } else {
      // 過去のログを表示
      const streamer = new LogStreamer({ taskId });
      const lines = await streamer.readLastNLines(Number(options.lines));
      for (const line of lines) {
        console.log(line);
      }
    }
  });
```

---

### 3.3 IssueDependencyResolver（F-011）

#### 目的

Issue間の依存関係を管理し、依存順に実行する機能を提供。

#### クラス定義

```typescript
// src/input/issue-dependency-resolver.ts

export interface DependencyNode {
  /**
   * Issue番号
   */
  issueNumber: number;

  /**
   * このIssueがブロックされているIssue番号のリスト
   * （このIssueを実行する前に完了する必要があるIssue）
   */
  blockedBy: number[];

  /**
   * このIssueがブロックしているIssue番号のリスト
   * （このIssueが完了しないと実行できないIssue）
   */
  blocking: number[];

  /**
   * Issueの状態
   */
  state: "open" | "closed";
}

export class IssueDependencyResolver {
  private readonly executor: ProcessExecutor;

  constructor(executor: ProcessExecutor = new BunProcessExecutor()) {
    this.executor = executor;
  }

  /**
   * Issue番号のリストを依存関係を考慮してソート
   * 
   * @param issueNumbers - Issue番号のリスト
   * @returns トポロジカルソート済みのIssue番号リスト
   * @throws CircularDependencyError - 循環依存を検出した場合
   */
  async resolveOrder(issueNumbers: number[]): Promise<number[]> {
    // 依存関係グラフを構築
    const graph = await this.buildDependencyGraph(issueNumbers);

    // 循環依存をチェック
    this.detectCircularDependency(graph);

    // トポロジカルソート
    return this.topologicalSort(graph);
  }

  /**
   * 指定されたIssueの依存関係を取得
   * 
   * @param issueNumber - Issue番号
   * @returns 依存関係ノード
   */
  async getDependencies(issueNumber: number): Promise<DependencyNode> {
    // GitHub Issue Dependencies API を使用
    const blockedByResult = await this.executor.spawn("gh", [
      "api",
      `repos/{owner}/{repo}/issues/${issueNumber}/dependencies/blocked_by`,
    ]);

    const blockingResult = await this.executor.spawn("gh", [
      "api",
      `repos/{owner}/{repo}/issues/${issueNumber}/dependencies/blocking`,
    ]);

    const blockedBy = blockedByResult.exitCode === 0
      ? JSON.parse(blockedByResult.stdout).map((issue: any) => issue.number)
      : [];

    const blocking = blockingResult.exitCode === 0
      ? JSON.parse(blockingResult.stdout).map((issue: any) => issue.number)
      : [];

    // Issue状態を取得
    const issueResult = await this.executor.spawn("gh", [
      "issue",
      "view",
      String(issueNumber),
      "--json",
      "state",
    ]);

    const state = issueResult.exitCode === 0
      ? JSON.parse(issueResult.stdout).state.toLowerCase()
      : "open";

    return {
      issueNumber,
      blockedBy,
      blocking,
      state,
    };
  }

  /**
   * 依存関係グラフを構築
   */
  private async buildDependencyGraph(
    issueNumbers: number[]
  ): Promise<Map<number, DependencyNode>> {
    const graph = new Map<number, DependencyNode>();

    for (const issueNumber of issueNumbers) {
      const node = await this.getDependencies(issueNumber);
      graph.set(issueNumber, node);
    }

    return graph;
  }

  /**
   * 循環依存を検出
   * 
   * @throws CircularDependencyError - 循環依存を検出した場合
   */
  private detectCircularDependency(
    graph: Map<number, DependencyNode>
  ): void {
    const visited = new Set<number>();
    const recursionStack = new Set<number>();

    const dfs = (issueNumber: number): boolean => {
      visited.add(issueNumber);
      recursionStack.add(issueNumber);

      const node = graph.get(issueNumber);
      if (!node) {
        return false;
      }

      for (const dep of node.blockedBy) {
        if (!visited.has(dep)) {
          if (dfs(dep)) {
            return true;
          }
        } else if (recursionStack.has(dep)) {
          // 循環依存を検出
          throw new CircularDependencyError(
            `循環依存を検出: Issue #${issueNumber} → #${dep}`,
            { cycle: [issueNumber, dep] }
          );
        }
      }

      recursionStack.delete(issueNumber);
      return false;
    };

    for (const issueNumber of graph.keys()) {
      if (!visited.has(issueNumber)) {
        dfs(issueNumber);
      }
    }
  }

  /**
   * トポロジカルソート
   */
  private topologicalSort(
    graph: Map<number, DependencyNode>
  ): number[] {
    const inDegree = new Map<number, number>();
    const result: number[] = [];

    // 入次数を計算
    for (const [issueNumber, node] of graph.entries()) {
      if (!inDegree.has(issueNumber)) {
        inDegree.set(issueNumber, 0);
      }

      for (const dep of node.blockedBy) {
        inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
      }
    }

    // 入次数が0のノードをキューに追加
    const queue: number[] = [];
    for (const [issueNumber, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(issueNumber);
      }
    }

    // トポロジカルソート
    while (queue.length > 0) {
      const issueNumber = queue.shift()!;
      result.push(issueNumber);

      const node = graph.get(issueNumber);
      if (!node) {
        continue;
      }

      for (const dep of node.blocking) {
        const degree = inDegree.get(dep)! - 1;
        inDegree.set(dep, degree);

        if (degree === 0) {
          queue.push(dep);
        }
      }
    }

    return result;
  }

  /**
   * 依存Issueが完了しているかチェック
   * 
   * @param issueNumber - Issue番号
   * @returns すべての依存Issueが完了している場合はtrue
   */
  async checkDependenciesCompleted(issueNumber: number): Promise<boolean> {
    const node = await this.getDependencies(issueNumber);

    for (const dep of node.blockedBy) {
      const depNode = await this.getDependencies(dep);
      if (depNode.state !== "closed") {
        logger.warn(
          `Issue #${issueNumber} は Issue #${dep} に依存していますが、未完了です。`
        );
        return false;
      }
    }

    return true;
  }
}
```

#### CLI統合

```typescript
// src/cli.ts に追加

program
  .command("run")
  .option("--resolve-deps", "依存Issueを先に実行")
  .option("--ignore-deps", "依存関係を無視")
  .option("--check-deps", "依存関係のみチェック（実行しない）")
  .action(async (options) => {
    // ... 既存の処理

    if (options.checkDeps) {
      // 依存関係のみチェック
      const resolver = new IssueDependencyResolver();
      const completed = await resolver.checkDependenciesCompleted(issueNumber);

      if (completed) {
        logger.success(`Issue #${issueNumber} の依存関係はすべて完了しています`);
      } else {
        logger.error(`Issue #${issueNumber} の依存関係が未完了です`);
        process.exit(1);
      }
      return;
    }

    if (options.resolveDeps) {
      // 依存Issueを先に実行
      const resolver = new IssueDependencyResolver();
      const node = await resolver.getDependencies(issueNumber);

      for (const dep of node.blockedBy) {
        logger.info(`依存Issue #${dep} を先に実行します`);
        await runIssue(dep, options);
      }
    } else if (!options.ignoreDeps) {
      // 依存関係をチェック（デフォルト）
      const resolver = new IssueDependencyResolver();
      const completed = await resolver.checkDependenciesCompleted(issueNumber);

      if (!completed) {
        logger.error(
          `Issue #${issueNumber} の依存関係が未完了です。` +
          `--resolve-deps で依存Issueを先に実行するか、` +
          `--ignore-deps で依存関係を無視してください。`
        );
        process.exit(1);
      }
    }

    // ... 既存の実行処理
  });
```

---

### 3.4 IssueStatusLabelManager（F-012）

#### 目的

GitHub Issueラベルでタスク状態を管理する機能を提供。

#### クラス定義

```typescript
// src/output/issue-status-label-manager.ts

export type IssueStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "blocked"
  | "pr-created"
  | "merged";

export interface LabelDefinition {
  name: string;
  color: string;
  description: string;
}

export const STATUS_LABELS: Record<IssueStatus, LabelDefinition> = {
  queued: {
    name: "orch:queued",
    color: "c2e0c6",
    description: "実行待ち",
  },
  running: {
    name: "orch:running",
    color: "0e8a16",
    description: "実行中",
  },
  completed: {
    name: "orch:completed",
    color: "1d76db",
    description: "正常完了",
  },
  failed: {
    name: "orch:failed",
    color: "d93f0b",
    description: "失敗",
  },
  blocked: {
    name: "orch:blocked",
    color: "fbca04",
    description: "ブロック中",
  },
  "pr-created": {
    name: "orch:pr-created",
    color: "6f42c1",
    description: "PR作成済み",
  },
  merged: {
    name: "orch:merged",
    color: "0052cc",
    description: "マージ完了",
  },
};

export interface IssueStatusLabelManagerConfig {
  /**
   * GitHub Issueラベルを使用するか
   */
  enabled: boolean;

  /**
   * ラベルのプレフィックス
   */
  labelPrefix: string;
}

export class IssueStatusLabelManager {
  private readonly config: IssueStatusLabelManagerConfig;
  private readonly executor: ProcessExecutor;
  private readonly labels: Map<IssueStatus, LabelDefinition>;

  constructor(
    config: IssueStatusLabelManagerConfig,
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;

    // ラベル定義をプレフィックスで更新
    this.labels = new Map();
    for (const [status, label] of Object.entries(STATUS_LABELS)) {
      this.labels.set(status as IssueStatus, {
        ...label,
        name: `${config.labelPrefix}:${status}`,
      });
    }
  }

  /**
   * リポジトリにステータスラベルを初期化
   * 
   * ラベルが存在しない場合は作成する
   */
  async initializeLabels(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    for (const label of this.labels.values()) {
      await this.ensureLabel(label);
    }

    logger.success("ステータスラベルを初期化しました");
  }

  /**
   * Issueのステータスラベルを更新
   * 
   * @param issueNumber - Issue番号
   * @param status - 新しいステータス
   */
  async updateStatus(issueNumber: number, status: IssueStatus): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    // 既存のステータスラベルを削除
    await this.removeAllStatusLabels(issueNumber);

    // 新しいステータスラベルを追加
    const label = this.labels.get(status);
    if (!label) {
      throw new Error(`未知のステータス: ${status}`);
    }

    await this.addLabel(issueNumber, label.name);

    logger.info(`Issue #${issueNumber} のステータスを ${status} に更新しました`);
  }

  /**
   * ラベルが存在することを確認（なければ作成）
   */
  private async ensureLabel(label: LabelDefinition): Promise<void> {
    // ラベルの存在確認
    const result = await this.executor.spawn("gh", [
      "label",
      "list",
      "--search",
      label.name,
      "--json",
      "name",
    ]);

    if (result.exitCode === 0) {
      const labels = JSON.parse(result.stdout);
      if (labels.some((l: any) => l.name === label.name)) {
        // ラベルが既に存在
        return;
      }
    }

    // ラベルを作成
    await this.executor.spawn("gh", [
      "label",
      "create",
      label.name,
      "--color",
      label.color,
      "--description",
      label.description,
    ]);

    logger.debug(`ラベル ${label.name} を作成しました`);
  }

  /**
   * Issueにラベルを追加
   */
  private async addLabel(issueNumber: number, labelName: string): Promise<void> {
    await this.executor.spawn("gh", [
      "issue",
      "edit",
      String(issueNumber),
      "--add-label",
      labelName,
    ]);
  }

  /**
   * Issueからすべてのステータスラベルを削除
   */
  private async removeAllStatusLabels(issueNumber: number): Promise<void> {
    // 現在のラベルを取得
    const result = await this.executor.spawn("gh", [
      "issue",
      "view",
      String(issueNumber),
      "--json",
      "labels",
    ]);

    if (result.exitCode !== 0) {
      return;
    }

    const issue = JSON.parse(result.stdout);
    const currentLabels = issue.labels.map((l: any) => l.name);

    // ステータスラベルのみを削除
    for (const labelName of currentLabels) {
      if (labelName.startsWith(`${this.config.labelPrefix}:`)) {
        await this.executor.spawn("gh", [
          "issue",
          "edit",
          String(issueNumber),
          "--remove-label",
          labelName,
        ]);
      }
    }
  }
}
```

#### Loop Engineへの統合

```typescript
// src/core/loop.ts に追加

export async function runLoop(context: LoopContext): Promise<LoopResult> {
  const labelManager = new IssueStatusLabelManager({
    enabled: config.state?.use_github_labels ?? true,
    labelPrefix: config.state?.label_prefix ?? "orch",
  });

  // タスク開始時: running
  await labelManager.updateStatus(context.issue.number, "running");

  try {
    // ... 既存のループ処理

    // タスク完了時: completed
    await labelManager.updateStatus(context.issue.number, "completed");

    // PR作成時: pr-created
    if (context.createPR) {
      const prNumber = await createPR(context);
      await labelManager.updateStatus(context.issue.number, "pr-created");

      // PR自動マージ
      if (config.pr?.autoMerge) {
        const merger = new PRAutoMerger(config.pr);
        await merger.autoMerge(prNumber);
        await labelManager.updateStatus(context.issue.number, "merged");
      }
    }

    return result;
  } catch (error) {
    // タスク失敗時: failed
    await labelManager.updateStatus(context.issue.number, "failed");
    throw error;
  }
}
```

#### 設定ファイル拡張

```yaml
# orch.yml に追加
state:
  use_github_labels: true
  label_prefix: "orch"  # カスタマイズ可能
```

#### TypeScript型定義拡張

```typescript
// src/core/types.ts に追加

export const StateConfigSchema = z.object({
  use_github_labels: z.boolean().default(true),
  use_scratchpad: z.boolean().default(true),
  scratchpad_path: z.string().default(".agent/scratchpad.md"),

  // 新規: ラベルプレフィックス
  label_prefix: z.string().default("orch"),
});

export type StateConfig = z.infer<typeof StateConfigSchema>;
```

---

## 4. 機能一覧

| ID | 機能名 | 概要 | 優先度 | 実装モジュール |
|----|--------|------|--------|---------------|
| F-009 | PR自動マージ機能 | CI成功後にPRを自動マージ | 重要 | PRAutoMerger |
| F-010 | リアルタイムログ監視機能 | 別ターミナルから実行中タスクのログを監視 | 重要 | LogMonitor |
| F-011 | Issue依存関係管理機能 | Issue間の依存関係を管理し、依存順に実行 | 重要 | IssueDependencyResolver |
| F-012 | Issueステータスラベル機能 | GitHub Issueラベルでタスク状態を管理 | 重要 | IssueStatusLabelManager |

### 4.1 機能詳細

#### F-009: PR自動マージ機能

**概要**: `--auto-merge`フラグでPR作成後、CIが成功したら自動的にマージ

**処理フロー**:
```
1. PR作成後、PR番号を取得
2. gh pr checks <PR番号> --watch でCI完了を待機
3. CI成功時: gh pr merge <PR番号> --squash --delete-branch でマージ
4. CI失敗時: エラーログを出力して終了
```

**CLI例**:
```bash
# PR作成後、CI成功時に自動マージ
orch run --issue 42 --auto --create-pr --auto-merge
```

**設定例**:
```yaml
pr:
  auto_merge: true
  merge_method: squash
  delete_branch: true
  ci_timeout_secs: 600
```

#### F-010: リアルタイムログ監視機能

**概要**: 別ターミナルから実行中タスクのログをリアルタイムで監視

**処理フロー**:
```
1. タスクIDに対応するログファイルパスを特定
2. fs.watch() または polling でログファイルを監視
3. 新しい行が追加されたら即座にコンソールに出力
4. Ctrl+Cで監視を終了
```

**CLI例**:
```bash
# ターミナル1: タスク実行
orch run --issue 42 --auto

# ターミナル2: リアルタイム監視
orch logs --task <task-id> --follow
```

#### F-011: Issue依存関係管理機能

**概要**: Issue間に依存関係がある場合、依存Issueが完了してから実行

**処理フロー**:
```
1. GitHub Issue Dependencies APIで依存関係を取得
2. 依存Issueが未完了の場合:
   - --resolve-deps あり: 依存Issueを先に実行
   - --resolve-deps なし: エラーを出力して終了
3. 複数Issue実行時は依存関係をトポロジカルソートして実行順を決定
4. 循環依存を検出したらエラーを出力
```

**CLI例**:
```bash
# 依存Issueが未完了ならエラー
orch run --issue 45 --auto

# 依存Issueを先に実行
orch run --issue 45 --auto --resolve-deps

# 依存関係を無視して実行
orch run --issue 45 --auto --ignore-deps
```

#### F-012: Issueステータスラベル機能

**概要**: タスクの実行状況をGitHub Issueのラベルで管理

**処理フロー**:
```
1. タスク開始時に orch:running ラベルを付与
2. 前のステータスラベルを自動削除（排他制御）
3. タスク完了時に orch:completed ラベルに変更
4. PR作成時に orch:pr-created ラベルを追加
5. マージ時に orch:merged ラベルに変更
6. 失敗時は orch:failed ラベルを付与
```

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

**設定例**:
```yaml
state:
  use_github_labels: true
  label_prefix: "orch"
```

---

## 5. データ設計

### 5.1 設定ファイル構造（orch.yml拡張）

```yaml
version: "1.0"

# バックエンド設定（既存）
backend:
  type: claude
  model: claude-sonnet-4-20250514

# サンドボックス設定（v1.2.0）
sandbox:
  type: docker
  fallback: host

# ループ設定（既存）
loop:
  max_iterations: 100
  completion_promise: "LOOP_COMPLETE"
  idle_timeout_secs: 1800

# 承認ゲート（既存）
gates:
  after_plan: true
  after_implementation: false
  before_pr: true

# PR設定（新規 v1.3.0）
pr:
  auto_merge: true
  merge_method: squash  # squash | merge | rebase
  delete_branch: true
  ci_timeout_secs: 600

# 状態管理（拡張 v1.3.0）
state:
  use_github_labels: true
  use_scratchpad: true
  scratchpad_path: ".agent/scratchpad.md"
  label_prefix: "orch"  # 新規

# 改善Issue自動作成（v1.2.0）
autoIssue:
  enabled: true
  minPriority: medium
  labels:
    - auto-generated
    - improvement
```

### 5.2 TypeScript型定義（拡張）

```typescript
// src/core/types.ts に追加

/**
 * PR設定のzodスキーマ
 */
export const PRConfigSchema = z.object({
  /**
   * PR自動マージを有効にするか
   */
  autoMerge: z.boolean().default(false),

  /**
   * マージ方式
   */
  mergeMethod: z.enum(["squash", "merge", "rebase"]).default("squash"),

  /**
   * マージ後にブランチを削除するか
   */
  deleteBranch: z.boolean().default(true),

  /**
   * CIタイムアウト（秒）
   */
  ciTimeoutSecs: z.number().default(600),
});

export type PRConfig = z.infer<typeof PRConfigSchema>;

/**
 * 状態管理設定のzodスキーマ（拡張）
 */
export const StateConfigSchema = z.object({
  use_github_labels: z.boolean().default(true),
  use_scratchpad: z.boolean().default(true),
  scratchpad_path: z.string().default(".agent/scratchpad.md"),

  /**
   * ラベルのプレフィックス
   */
  label_prefix: z.string().default("orch"),
});

export type StateConfig = z.infer<typeof StateConfigSchema>;

/**
 * 設定ファイル全体のzodスキーマ（拡張版）
 */
export const ConfigSchema = z.object({
  version: z.string().default("1.0"),
  backend: z.object({
    type: z.enum(["claude", "opencode", "gemini", "container"]).default("claude"),
    model: z.string().optional(),
  }),
  container: ContainerConfigSchema,
  sandbox: SandboxConfigSchema.optional(),
  loop: z.object({
    max_iterations: z.number().default(100),
    completion_promise: z.string().default("LOOP_COMPLETE"),
    idle_timeout_secs: z.number().default(1800),
  }),
  hats: z.record(z.string(), HatSchema).optional(),
  gates: z
    .object({
      after_plan: z.boolean().default(true),
      after_implementation: z.boolean().default(false),
      before_pr: z.boolean().default(true),
    })
    .optional(),
  quality: z
    .object({
      min_score: z.number().default(8),
      auto_approve_above: z.number().default(9),
    })
    .optional(),
  state: StateConfigSchema.optional(),
  autoIssue: AutoIssueConfigSchema.optional(),

  // 新規: PR設定
  pr: PRConfigSchema.optional(),
});

export type Config = z.infer<typeof ConfigSchema>;
```

---

## 6. 非機能要件

### 6.1 性能要件

| ID | 要件 | 目標値 | 測定方法 |
|----|------|--------|----------|
| NFR-P-004 | CI監視レスポンス時間 | 1秒以内 | 統合テスト |
| NFR-P-005 | ログ監視遅延 | 500ms以内 | 統合テスト |
| NFR-P-006 | 依存関係解析時間 | 2秒以内（10Issue） | 統合テスト |

### 6.2 可用性要件

| ID | 要件 | 目標値 |
|----|------|--------|
| NFR-A-004 | CIタイムアウト時の挙動 | エラーログ出力、マージせずに終了 |
| NFR-A-005 | ログファイル破損時の挙動 | エラーログ出力、監視を継続 |

### 6.3 セキュリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-S-005 | GitHub Token管理 | 環境変数または設定ファイル（.gitignore対象） |
| NFR-S-006 | 機密情報のログ出力禁止 | トークン、パスワードはマスク |

### 6.4 ユーザビリティ要件

| ID | 要件 | 詳細 |
|----|------|------|
| NFR-U-005 | CI監視の進捗表示 | CI実行状況をリアルタイムで表示 |
| NFR-U-006 | 依存関係の可視化 | 依存関係グラフを視覚的に表示 |

---

## 7. エラーハンドリング設計

### 7.1 エラークラス階層

```typescript
// src/core/errors.ts に追加

/**
 * PR自動マージエラー
 */
export class PRAutoMergeError extends SandboxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "PR_AUTO_MERGE_ERROR", details);
  }
}

/**
 * ログ監視エラー
 */
export class LogMonitorError extends SandboxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "LOG_MONITOR_ERROR", details);
  }
}

/**
 * 循環依存エラー
 */
export class CircularDependencyError extends SandboxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CIRCULAR_DEPENDENCY_ERROR", details);
  }
}

/**
 * Issue依存関係エラー
 */
export class IssueDependencyError extends SandboxError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "ISSUE_DEPENDENCY_ERROR", details);
  }
}
```

### 7.2 エラーハンドリング方針

| エラー種別 | 対処方法 | リトライ |
|-----------|---------|---------|
| CI失敗 | エラーログ出力、マージせずに終了 | なし |
| CIタイムアウト | エラーログ出力、マージせずに終了 | なし |
| ログファイル不在 | エラーログ出力、監視を終了 | なし |
| 循環依存検出 | エラーログ出力、実行を中断 | なし |
| 依存Issue未完了 | エラーログ出力、実行を中断（--resolve-depsで回避可能） | なし |
| GitHub API障害 | エラーログ出力、処理は継続 | 3回 |

---

## 8. 既存モジュールとの統合ポイント

### 8.1 Loop Engineとの統合

```typescript
// src/core/loop.ts

export async function runLoop(context: LoopContext): Promise<LoopResult> {
  const labelManager = new IssueStatusLabelManager({
    enabled: config.state?.use_github_labels ?? true,
    labelPrefix: config.state?.label_prefix ?? "orch",
  });

  // 1. タスク開始時: running
  await labelManager.updateStatus(context.issue.number, "running");

  try {
    // 2. 既存のループ処理
    // ...

    // 3. タスク完了時: completed
    await labelManager.updateStatus(context.issue.number, "completed");

    // 4. PR作成時: pr-created
    if (context.createPR) {
      const prNumber = await createPR(context);
      await labelManager.updateStatus(context.issue.number, "pr-created");

      // 5. PR自動マージ
      if (config.pr?.autoMerge) {
        const merger = new PRAutoMerger(config.pr);
        await merger.autoMerge(prNumber);
        await labelManager.updateStatus(context.issue.number, "merged");
      }
    }

    return result;
  } catch (error) {
    // 6. タスク失敗時: failed
    await labelManager.updateStatus(context.issue.number, "failed");
    throw error;
  }
}
```

### 8.2 CLIとの統合

```typescript
// src/cli.ts

program
  .command("run")
  .option("--auto-merge", "PR作成後、CI成功時に自動マージ")
  .option("--resolve-deps", "依存Issueを先に実行")
  .option("--ignore-deps", "依存関係を無視")
  .option("--check-deps", "依存関係のみチェック（実行しない）")
  .action(async (options) => {
    // 1. 依存関係チェック
    if (options.checkDeps) {
      const resolver = new IssueDependencyResolver();
      const completed = await resolver.checkDependenciesCompleted(issueNumber);
      // ...
      return;
    }

    // 2. 依存関係解決
    if (options.resolveDeps) {
      const resolver = new IssueDependencyResolver();
      const node = await resolver.getDependencies(issueNumber);
      for (const dep of node.blockedBy) {
        await runIssue(dep, options);
      }
    }

    // 3. 既存の実行処理
    // ...
  });

program
  .command("logs")
  .option("-t, --task <id>", "タスクID")
  .option("-f, --follow", "リアルタイムで監視")
  .action(async (options) => {
    if (options.follow) {
      const monitor = new LogMonitor({ taskId: options.task });
      await monitor.monitor((line) => console.log(line));
    } else {
      // 既存のログ表示ロジック
    }
  });
```

---

## 9. 制約事項・前提条件

### 9.1 技術的制約

| 制約 | 詳細 | 理由 |
|------|------|------|
| GitHub CLI | gh CLI がインストール・認証済み | PR操作、Issue Dependencies API利用 |
| GitHub Issue Dependencies API | 2025年8月GA | 依存関係管理機能の前提 |
| fs.watch() | Bunで利用可能 | ログ監視機能の前提 |

### 9.2 ビジネス制約

| 制約 | 詳細 |
|------|------|
| 予算 | なし（OSS） |
| スケジュール | Phase 3: 2週間 |
| リソース | 開発者1名 |

### 9.3 前提条件

- GitHub Personal Access Tokenが発行されている
- リポジトリへの書き込み権限がある
- CI設定が存在する（GitHub Actions等）

---

## 10. リスクと対策

### 10.1 リスク一覧

| ID | リスク | 影響度 | 発生確率 | 対策 |
|----|--------|--------|---------|------|
| R-006 | CI監視中のネットワーク障害 | 中 | 低 | タイムアウト設定、リトライ機能 |
| R-007 | 依存関係APIの利用不可 | 中 | 低 | エラーメッセージ表示、手動実行を促す |
| R-008 | ラベル付与時のAPI rate limit | 低 | 中 | リトライ機能、rate limit確認 |
| R-009 | fs.watch()の動作不安定 | 中 | 低 | pollingモードへのフォールバック |

### 10.2 未解決課題

| ID | 課題 | 担当 | 期限 |
|----|------|------|------|
| I-004 | CI監視のタイムアウト値の最適化 | 開発者 | Phase 3開始前 |
| I-005 | 依存関係グラフの可視化方法 | 開発者 | Phase 3開始前 |
| I-006 | ラベル体系のカスタマイズ範囲 | 開発者 | Phase 3開始前 |

---

## 11. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-25 | 初版作成（Phase 3機能: F-009~F-012） | AI Assistant |

---

## 12. 参考資料

### 12.1 技術ドキュメント

- [GitHub Issue Dependencies API](https://docs.github.com/en/rest/issues/dependencies)
- [GitHub CLI - PR Commands](https://cli.github.com/manual/gh_pr)
- [Node.js fs.watch()](https://nodejs.org/api/fs.html#fswatchfilename-options-listener)
- [Topological Sort Algorithm](https://en.wikipedia.org/wiki/Topological_sorting)

### 12.2 既存実装参考

- `src/core/log-writer.ts` - ログファイル書き込み（v1.2.0）
- `src/core/log-streamer.ts` - ログファイル読み取り（v1.2.0）
- `src/output/pr.ts` - PR作成（既存）
- `src/core/loop.ts` - ループエンジン（既存）

---

## 付録A: 実装優先順位

### Phase 3（v1.3.0新機能）

1. F-012: Issueステータスラベル機能（基盤）
2. F-010: リアルタイムログ監視機能（独立）
3. F-011: Issue依存関係管理機能（独立）
4. F-009: PR自動マージ機能（F-012に依存）

### Phase 4（将来検討）

- 依存関係グラフの可視化UI
- ラベル体系の完全カスタマイズ
- CI設定の自動生成
- マルチリポジトリ対応
