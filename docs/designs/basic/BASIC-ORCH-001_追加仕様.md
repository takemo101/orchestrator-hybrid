# orchestrator-hybrid 追加仕様 基本設計書

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | BASIC-ORCH-001 |
| バージョン | 1.0.0 |
| ステータス | ドラフト |
| 作成日 | 2026-01-24 |
| 最終更新日 | 2026-01-24 |
| 作成者 | AI Assistant |
| 承認者 | - |
| 関連要件定義書 | REQ-ORCH-001 v1.2.0 |

---

## 1. 概要

### 1.1 目的

orchestrator-hybridに以下の機能を追加し、実行環境の柔軟性と開発者体験を向上させる：

1. **Docker sandbox対応**: Dockerコンテナ内での隔離実行
2. **ホスト環境実行対応**: コンテナ環境が利用できない場合のフォールバック
3. **JSON Schema対応**: YAML設定ファイルの補完・検証機能
4. **改善Issue自動作成**: ralph-loop実行時の改善点自動Issue化
5. **実行ログリアルタイム確認**: タスク実行中のAIエージェント出力のリアルタイム表示

### 1.2 背景

現在のorchestrator-hybridは、container-useによるサンドボックス環境のみに対応しています。しかし、以下の課題があります：

- Docker環境での実行ニーズがあるが未対応
- macOS/Windowsなどでコンテナ環境が利用困難な場合の代替手段がない
- YAML設定ファイルの補完機能がなく、設定ミスが発生しやすい
- ralph-loop実行時に発見された改善点を手動でIssue化する必要がある
- タスク実行中のAIエージェント出力をリアルタイムで確認できない

### 1.3 スコープ

#### スコープ内

- Docker sandboxアダプターの実装（F-001）
- ホスト環境実行アダプターの実装（F-002）
- 実行環境選択機能（F-003）
- JSON Schema定義とスキーマ検証機能（F-004, F-005）
- 改善Issue自動作成機能（F-006, F-007）
- 実行ログリアルタイム確認機能（F-008）

#### スコープ外

- Podman等のその他コンテナランタイム対応
- GitHub Issue以外の入力ソース対応
- 既存機能の大幅なリファクタリング

### 1.4 用語定義

| 用語 | 定義 |
|------|------|
| sandbox | コード実行環境（隔離された環境） |
| host環境 | ホストマシン上で直接コードを実行する環境（隔離なし） |
| ProcessExecutor | プロセス実行を抽象化するインターフェース |
| SandboxAdapter | サンドボックス環境を抽象化するインターフェース |
| LogWriter | ログファイル書き込みを担当するコンポーネント |
| LogStreamer | ログファイルのリアルタイム読み取りを担当するコンポーネント |

---

## 2. システムアーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────────────────────────────┐
│                    Orchestrator Hybrid                           │
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
│                      │                │                         │
│                      ▼                ▼                         │
│               ┌──────────────┐  ┌──────────────┐                │
│               │  Approval    │  │   Issue      │                │
│               │    Gates     │  │  Generator   │ ← 新規         │
│               └──────────────┘  └──────────────┘                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Sandbox Abstraction Layer (新規)            │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │   Docker     │  │ Container-   │  │    Host      │   │   │
│  │  │   Adapter    │  │ Use Adapter  │  │   Adapter    │   │   │
│  │  │   (新規)     │  │   (既存)     │  │   (新規)     │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │         │                 │                 │           │   │
│  │         └─────────────────┴─────────────────┘           │   │
│  │                           │                             │   │
│  │                    ┌──────────────┐                     │   │
│  │                    │   Sandbox    │                     │   │
│  │                    │   Factory    │                     │   │
│  │                    └──────────────┘                     │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Process Execution Layer (新規抽象化)            │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐                                       │   │
│  │  │     Bun      │                                       │   │
│  │  │   Process    │                                       │   │
│  │  │   Executor   │                                       │   │
│  │  └──────────────┘                                       │   │
│  │         │                                               │   │
│  │         └─────────────────────────────────────────────▶ │   │
│  │                    ProcessExecutor Interface           │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Logging System (拡張)                       │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │  Console     │  │     Log      │  │     Log      │   │   │
│  │  │   Logger     │  │   Writer     │  │  Streamer    │   │   │
│  │  │   (既存)     │  │   (新規)     │  │   (新規)     │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                           │                 │           │   │
│  │                           ▼                 ▼           │   │
│  │                    .agent/<task-id>/                    │   │
│  │                    ├── output.log                       │   │
│  │                    ├── stdout.log                       │   │
│  │                    └── stderr.log                       │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │          Configuration & Validation (拡張)               │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │    YAML      │  │     Zod      │  │    JSON      │   │   │
│  │  │   Parser     │  │  Validator   │  │   Schema     │   │   │
│  │  │   (既存)     │  │   (既存)     │  │  Generator   │   │   │
│  │  │              │  │              │  │   (新規)     │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │         │                 │                 │           │   │
│  │         ▼                 ▼                 ▼           │   │
│  │    orch.yml          Validation       orch.schema.json  │   │
│  │    config.yml                        config.schema.json │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 技術スタック

| レイヤー | 技術 | バージョン | 備考 |
|---------|------|-----------|------|
| **ランタイム** | Bun | 1.0以上 | 専用（Node.js対応を考慮した抽象化層を設ける） |
| **プロセス実行** | Bun.spawn | - | ProcessExecutor interfaceで抽象化 |
| **言語** | TypeScript | 5.0以上 | strict mode |
| **CLIフレームワーク** | commander | ^12.0.0 | 既存 |
| **設定ファイル** | yaml | ^2.4.0 | 既存 |
| **スキーマ検証** | zod | ^3.23.0 | 既存 |
| **JSON Schema生成** | zod-to-json-schema | 最新 | F-004対応で新規追加 |
| **ログ管理** | 独自実装 | - | F-008対応（ファイル出力対応） |
| **テスト** | bun test | - | 既存 |
| **Lint/Format** | Biome | ^2.3.11 | 既存 |
| **コンテナ連携** | Docker CLI | 20.10以上 | F-001対応 |
| **外部API** | GitHub REST API | - | F-006対応（gh CLI経由） |

#### 技術選定理由

| 技術 | 選定理由 |
|------|---------|
| Bun | 既存プロジェクトの標準ランタイム。高速なJavaScript/TypeScript実行環境 |
| TypeScript strict mode | 型安全性の確保、実行時エラーの削減 |
| zod | 既存プロジェクトで使用中。実行時型検証とTypeScript型定義の統合 |
| zod-to-json-schema | zodスキーマからJSON Schemaを自動生成。型定義との一貫性を保証 |
| Docker CLI | 標準的なコンテナ実行環境。広く普及しており、ドキュメントも豊富 |
| gh CLI | GitHub APIの公式CLI。認証管理が容易 |

### 2.3 外部システム連携

```
┌─────────────────────────────────────────────────────────────┐
│                  Orchestrator Hybrid                         │
└─────────────────────────────────────────────────────────────┘
                    │                    │
                    ▼                    ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  Docker Engine   │  │   GitHub API     │
        │  (F-001)         │  │   (F-006)        │
        └──────────────────┘  └──────────────────┘
                │                      │
                ▼                      ▼
        ┌──────────────────┐  ┌──────────────────┐
        │  Docker CLI      │  │   gh CLI         │
        │  - docker run    │  │   - gh issue     │
        │  - docker exec   │  │     create       │
        │  - docker rm     │  │   - gh issue     │
        │                  │  │     list         │
        └──────────────────┘  └──────────────────┘
```

---

## 3. システムアーキテクチャ詳細

### 3.1 コンポーネント一覧

| コンポーネント | 種別 | 責務 | 新規/既存 |
|--------------|------|------|----------|
| **ProcessExecutor** | Interface | プロセス実行の抽象化 | 新規 |
| **BunProcessExecutor** | Class | Bun.spawnのラッパー実装 | 新規 |
| **SandboxAdapter** | Interface | サンドボックス環境の抽象化 | 新規 |
| **DockerAdapter** | Class | Docker環境でのコード実行 | 新規 |
| **HostAdapter** | Class | ホスト環境でのコード実行 | 新規 |
| **ContainerAdapter** | Class | container-use環境でのコード実行 | 既存（リファクタ） |
| **SandboxFactory** | Class | 設定に基づいてAdapterを生成 | 新規 |
| **LogWriter** | Class | ログファイル書き込み | 新規 |
| **LogStreamer** | Class | ログファイルのリアルタイム読み取り | 新規 |
| **SchemaGenerator** | Function | zodスキーマからJSON Schema生成 | 新規 |
| **ConfigValidator** | Function | YAML設定のスキーマ検証 | 拡張 |
| **IssueGenerator** | Class | 改善点からGitHub Issue作成 | 新規 |

### 3.2 依存関係

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│                        (src/cli.ts)                          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Core Layer                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  Loop    │  │   Hat    │  │  Event   │  │  Config  │    │
│  │  Engine  │  │  System  │  │   Bus    │  │  Loader  │    │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Adapter Layer (新規抽象化)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              SandboxAdapter Interface                │   │
│  └──────────────────────────────────────────────────────┘   │
│         │                  │                  │             │
│         ▼                  ▼                  ▼             │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │  Docker  │      │Container │      │   Host   │          │
│  │ Adapter  │      │  Adapter │      │ Adapter  │          │
│  └──────────┘      └──────────┘      └──────────┘          │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Process Execution Layer (新規)                  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            ProcessExecutor Interface                 │   │
│  └──────────────────────────────────────────────────────┘   │
│                            │                                │
│                            ▼                                │
│                  ┌──────────────────┐                       │
│                  │  BunProcess      │                       │
│                  │  Executor        │                       │
│                  └──────────────────┘                       │
│                            │                                │
│                            ▼                                │
│                      Bun.spawn                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. モジュール設計

### 4.1 ProcessExecutor抽象化（重要）

#### 目的

- Bun.spawnへの直接依存を排除
- 将来のNode.js対応を容易にする
- テスト時のモック化を簡単にする

#### インターフェース定義

```typescript
// src/core/process-executor.ts

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  stdin?: string;
  timeout?: number;
  stdout?: "pipe" | "inherit";
  stderr?: "pipe" | "inherit";
}

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ProcessExecutor {
  /**
   * コマンドを実行する
   * @param command 実行するコマンド
   * @param args コマンド引数
   * @param options 実行オプション
   * @returns 実行結果
   */
  spawn(
    command: string,
    args: string[],
    options?: SpawnOptions
  ): Promise<ProcessResult>;
}
```

#### 実装クラス

```typescript
// src/core/bun-process-executor.ts

export class BunProcessExecutor implements ProcessExecutor {
  async spawn(
    command: string,
    args: string[],
    options: SpawnOptions = {}
  ): Promise<ProcessResult> {
    const proc = Bun.spawn([command, ...args], {
      cwd: options.cwd,
      env: options.env,
      stdin: options.stdin ? "pipe" : undefined,
      stdout: options.stdout ?? "pipe",
      stderr: options.stderr ?? "pipe",
    });

    // タイムアウト処理
    if (options.timeout) {
      const timeoutId = setTimeout(() => {
        proc.kill();
      }, options.timeout);
      
      proc.exited.then(() => clearTimeout(timeoutId));
    }

    // stdin書き込み
    if (options.stdin && proc.stdin) {
      const writer = proc.stdin.getWriter();
      await writer.write(new TextEncoder().encode(options.stdin));
      await writer.close();
    }

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    return { stdout, stderr, exitCode };
  }
}
```

#### 既存コードへの影響

| ファイル | 変更内容 | 影響度 |
|---------|---------|--------|
| `src/core/exec.ts` | BunProcessExecutorを使用するように変更 | 中 |
| `src/adapters/container.ts` | ProcessExecutorをDI | 中 |
| `src/adapters/claude.ts` | ProcessExecutorをDI | 小 |
| `src/adapters/opencode.ts` | ProcessExecutorをDI | 小 |

### 4.2 SandboxAdapter抽象化

#### インターフェース定義

```typescript
// src/adapters/sandbox-adapter.ts

export interface SandboxAdapter {
  /**
   * アダプター名
   */
  readonly name: string;

  /**
   * サンドボックス環境でコマンドを実行
   * @param command 実行するコマンド
   * @param options 実行オプション
   * @returns 実行結果
   */
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * サンドボックス環境のクリーンアップ
   */
  cleanup(): Promise<void>;

  /**
   * サンドボックス環境が利用可能かチェック
   */
  isAvailable(): Promise<boolean>;
}

export interface ExecuteOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface ExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}
```

#### 実装クラス

##### DockerAdapter（新規）

```typescript
// src/adapters/docker-adapter.ts

export interface DockerAdapterConfig {
  image: string;
  workdir?: string;
  network?: "none" | "bridge" | "host";
  timeout?: number;
}

export class DockerAdapter implements SandboxAdapter {
  readonly name = "docker";
  private readonly config: DockerAdapterConfig;
  private readonly executor: ProcessExecutor;

  constructor(
    config: DockerAdapterConfig,
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executor.spawn("docker", ["--version"]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    // イメージの存在確認（なければpull）
    await this.ensureImage();

    // docker runコマンドの構築
    const args = this.buildDockerRunArgs(command, options);

    // 実行
    const result = await this.executor.spawn("docker", args, {
      timeout: options.timeout ?? this.config.timeout,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  private async ensureImage(): Promise<void> {
    const result = await this.executor.spawn("docker", [
      "image",
      "inspect",
      this.config.image,
    ]);

    if (result.exitCode !== 0) {
      // イメージが存在しない場合はpull
      await this.executor.spawn("docker", ["pull", this.config.image]);
    }
  }

  private buildDockerRunArgs(
    command: string,
    options: ExecuteOptions
  ): string[] {
    const args = [
      "run",
      "--rm", // 実行後に自動削除
      "-i", // インタラクティブモード
    ];

    // ネットワーク設定
    if (this.config.network) {
      args.push("--network", this.config.network);
    }

    // 作業ディレクトリのマウント
    const workdir = options.cwd ?? this.config.workdir ?? process.cwd();
    args.push("-v", `${workdir}:/workspace`);
    args.push("-w", "/workspace");

    // 環境変数
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // イメージとコマンド
    args.push(this.config.image);
    args.push("sh", "-c", command);

    return args;
  }

  async cleanup(): Promise<void> {
    // Dockerは--rmで自動削除されるため、特に処理なし
  }
}
```

##### HostAdapter（新規）

```typescript
// src/adapters/host-adapter.ts

export interface HostAdapterConfig {
  timeout?: number;
  warnOnStart?: boolean;
}

export class HostAdapter implements SandboxAdapter {
  readonly name = "host";
  private readonly config: HostAdapterConfig;
  private readonly executor: ProcessExecutor;
  private hasWarned = false;

  constructor(
    config: HostAdapterConfig = {},
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;
  }

  async isAvailable(): Promise<boolean> {
    // ホスト環境は常に利用可能
    return true;
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    // 初回実行時に警告を表示
    if (!this.hasWarned && (this.config.warnOnStart ?? true)) {
      logger.warn(
        "⚠️  ホスト環境で実行中: コードは隔離されていません。" +
        "本番環境ではDockerまたはcontainer-useの使用を推奨します。"
      );
      this.hasWarned = true;
    }

    // シェル経由でコマンドを実行
    const result = await this.executor.spawn("sh", ["-c", command], {
      cwd: options.cwd,
      env: options.env,
      timeout: options.timeout ?? this.config.timeout,
    });

    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  }

  async cleanup(): Promise<void> {
    // ホスト環境では特にクリーンアップ不要
  }
}
```

##### ContainerAdapter（既存をリファクタ）

```typescript
// src/adapters/container-adapter.ts

export class ContainerAdapter implements SandboxAdapter {
  readonly name = "container-use";
  private envId: string | null = null;
  private readonly config: ContainerAdapterConfig;
  private readonly executor: ProcessExecutor;

  constructor(
    config: ContainerAdapterConfig = {},
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.executor.spawn("cu", ["--version"]);
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  async execute(
    command: string,
    options: ExecuteOptions = {}
  ): Promise<ExecuteResult> {
    if (!this.envId) {
      await this.createEnvironment();
    }

    const result = await this.runInContainer(command, options);
    return result;
  }

  // ... 既存の実装を維持
}
```

#### SandboxFactory（新規）

```typescript
// src/adapters/sandbox-factory.ts

export class SandboxFactory {
  static async create(
    config: Config,
    executor?: ProcessExecutor
  ): Promise<SandboxAdapter> {
    const sandboxType = config.sandbox?.type ?? "container-use";
    const fallbackType = config.sandbox?.fallback;

    // プライマリ環境を試行
    const primaryAdapter = this.createAdapter(sandboxType, config, executor);
    if (await primaryAdapter.isAvailable()) {
      return primaryAdapter;
    }

    // フォールバック環境を試行
    if (fallbackType) {
      logger.warn(
        `${sandboxType}が利用できません。${fallbackType}にフォールバックします。`
      );
      const fallbackAdapter = this.createAdapter(fallbackType, config, executor);
      if (await fallbackAdapter.isAvailable()) {
        return fallbackAdapter;
      }
    }

    // どちらも利用できない場合はエラー
    throw new Error(
      `サンドボックス環境が利用できません: ${sandboxType}` +
      (fallbackType ? `, ${fallbackType}` : "")
    );
  }

  private static createAdapter(
    type: string,
    config: Config,
    executor?: ProcessExecutor
  ): SandboxAdapter {
    switch (type) {
      case "docker":
        return new DockerAdapter(
          {
            image: config.sandbox?.docker?.image ?? "node:20-alpine",
            network: config.sandbox?.docker?.network,
            timeout: config.sandbox?.docker?.timeout,
          },
          executor
        );

      case "container-use":
        return new ContainerAdapter(
          {
            image: config.sandbox?.containerUse?.image,
            envId: config.sandbox?.containerUse?.envId,
          },
          executor
        );

      case "host":
        return new HostAdapter(
          {
            timeout: config.sandbox?.host?.timeout,
            warnOnStart: config.sandbox?.host?.warnOnStart,
          },
          executor
        );

      default:
        throw new Error(`未知のサンドボックスタイプ: ${type}`);
    }
  }
}
```

### 4.3 ログ管理システム（F-008対応）

#### LogWriter（新規）

```typescript
// src/core/log-writer.ts

export interface LogWriterConfig {
  taskId: string;
  baseDir?: string;
}

export class LogWriter {
  private readonly taskId: string;
  private readonly logDir: string;
  private outputFile: Bun.file | null = null;
  private stdoutFile: Bun.file | null = null;
  private stderrFile: Bun.file | null = null;

  constructor(config: LogWriterConfig) {
    this.taskId = config.taskId;
    this.logDir = path.join(
      config.baseDir ?? ".agent",
      config.taskId
    );
  }

  async initialize(): Promise<void> {
    // ログディレクトリを作成
    await fs.mkdir(this.logDir, { recursive: true });

    // ログファイルを開く
    this.outputFile = Bun.file(path.join(this.logDir, "output.log"));
    this.stdoutFile = Bun.file(path.join(this.logDir, "stdout.log"));
    this.stderrFile = Bun.file(path.join(this.logDir, "stderr.log"));
  }

  async writeOutput(data: string): Promise<void> {
    if (!this.outputFile) {
      throw new Error("LogWriter not initialized");
    }
    await Bun.write(this.outputFile, data, { append: true });
  }

  async writeStdout(data: string): Promise<void> {
    if (!this.stdoutFile) {
      throw new Error("LogWriter not initialized");
    }
    await Bun.write(this.stdoutFile, data, { append: true });
    await this.writeOutput(data); // output.logにも書き込む
  }

  async writeStderr(data: string): Promise<void> {
    if (!this.stderrFile) {
      throw new Error("LogWriter not initialized");
    }
    await Bun.write(this.stderrFile, data, { append: true });
    await this.writeOutput(data); // output.logにも書き込む
  }

  getLogDir(): string {
    return this.logDir;
  }
}
```

#### LogStreamer（新規）

```typescript
// src/core/log-streamer.ts

export interface LogStreamerConfig {
  taskId: string;
  baseDir?: string;
  follow?: boolean;
}

export class LogStreamer {
  private readonly taskId: string;
  private readonly logPath: string;
  private readonly follow: boolean;
  private abortController: AbortController | null = null;

  constructor(config: LogStreamerConfig) {
    this.taskId = config.taskId;
    this.logPath = path.join(
      config.baseDir ?? ".agent",
      config.taskId,
      "output.log"
    );
    this.follow = config.follow ?? false;
  }

  async stream(callback: (line: string) => void): Promise<void> {
    // ファイルの存在確認
    if (!await fs.exists(this.logPath)) {
      throw new Error(`ログファイルが見つかりません: ${this.logPath}`);
    }

    if (this.follow) {
      await this.streamFollow(callback);
    } else {
      await this.streamOnce(callback);
    }
  }

  private async streamOnce(callback: (line: string) => void): Promise<void> {
    const content = await Bun.file(this.logPath).text();
    const lines = content.split("\n");
    for (const line of lines) {
      if (line) {
        callback(line);
      }
    }
  }

  private async streamFollow(callback: (line: string) => void): Promise<void> {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let lastSize = 0;

    while (!signal.aborted) {
      const file = Bun.file(this.logPath);
      const currentSize = file.size;

      if (currentSize > lastSize) {
        // 新しいデータを読み取る
        const content = await file.text();
        const newContent = content.slice(lastSize);
        const lines = newContent.split("\n");

        for (const line of lines) {
          if (line && !signal.aborted) {
            callback(line);
          }
        }

        lastSize = currentSize;
      }

      // 1秒待機
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

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
  .action(async (options) => {
    const taskId = options.task ?? await selectTask();
    
    const streamer = new LogStreamer({
      taskId,
      follow: options.follow ?? false,
    });

    try {
      await streamer.stream((line) => {
        console.log(line);
      });
    } catch (error) {
      logger.error(`ログの読み取りに失敗: ${error.message}`);
      process.exit(1);
    }

    // Ctrl+Cで終了
    process.on("SIGINT", () => {
      streamer.stop();
      process.exit(0);
    });
  });
```

### 4.4 JSON Schema生成（F-004, F-005対応）

#### スキーマ生成スクリプト

```typescript
// scripts/generate-schemas.ts

import { zodToJsonSchema } from "zod-to-json-schema";
import { ConfigSchema } from "../src/core/types.js";
import fs from "fs/promises";

async function generateSchemas() {
  // config.ymlのスキーマ生成
  const configSchema = zodToJsonSchema(ConfigSchema, {
    name: "OrchConfig",
    $refStrategy: "none",
  });

  await fs.writeFile(
    "config.schema.json",
    JSON.stringify(configSchema, null, 2)
  );

  console.log("✅ config.schema.json を生成しました");

  // orch.ymlのスキーマ生成（configと同じ）
  await fs.writeFile(
    "orch.schema.json",
    JSON.stringify(configSchema, null, 2)
  );

  console.log("✅ orch.schema.json を生成しました");
}

generateSchemas().catch(console.error);
```

#### package.jsonに追加

```json
{
  "scripts": {
    "generate:schemas": "bun run scripts/generate-schemas.ts"
  }
}
```

#### VSCode設定例（README.mdに記載）

```json
// .vscode/settings.json
{
  "yaml.schemas": {
    "./config.schema.json": ["config.yml"],
    "./orch.schema.json": ["orch.yml"]
  }
}
```

#### スキーマ検証の統合

```typescript
// src/core/config.ts に追加

export async function validateConfig(config: unknown): Promise<Config> {
  try {
    return ConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.errors.map((err) => {
        const path = err.path.join(".");
        return `  - ${path}: ${err.message}`;
      });

      throw new Error(
        "設定ファイルの検証に失敗しました:\n" + messages.join("\n")
      );
    }
    throw error;
  }
}
```

### 4.5 改善Issue自動作成（F-006, F-007対応）

#### IssueGenerator（新規）

```typescript
// src/output/issue-generator.ts

export interface ImprovementSuggestion {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  relatedFiles: string[];
  category?: string;
}

export interface IssueGeneratorConfig {
  enabled: boolean;
  minPriority: "high" | "medium" | "low";
  labels: string[];
  repository?: string;
}

export class IssueGenerator {
  private readonly config: IssueGeneratorConfig;
  private readonly executor: ProcessExecutor;

  constructor(
    config: IssueGeneratorConfig,
    executor: ProcessExecutor = new BunProcessExecutor()
  ) {
    this.config = config;
    this.executor = executor;
  }

  async createIssues(
    suggestions: ImprovementSuggestion[]
  ): Promise<string[]> {
    if (!this.config.enabled) {
      logger.info("Issue自動作成は無効です");
      return [];
    }

    const createdIssues: string[] = [];

    for (const suggestion of suggestions) {
      // 優先度フィルタ
      if (!this.shouldCreateIssue(suggestion.priority)) {
        logger.debug(
          `優先度が低いためスキップ: ${suggestion.title} (${suggestion.priority})`
        );
        continue;
      }

      // 重複チェック
      if (await this.isDuplicate(suggestion)) {
        logger.debug(`重複のためスキップ: ${suggestion.title}`);
        continue;
      }

      // Issue作成
      const issueUrl = await this.createIssue(suggestion);
      createdIssues.push(issueUrl);
      logger.success(`Issue作成: ${issueUrl}`);
    }

    return createdIssues;
  }

  private shouldCreateIssue(priority: string): boolean {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const minPriorityValue = priorityOrder[this.config.minPriority];
    const suggestionPriorityValue = priorityOrder[priority];

    return suggestionPriorityValue >= minPriorityValue;
  }

  private async isDuplicate(
    suggestion: ImprovementSuggestion
  ): Promise<boolean> {
    // 既存Issueを検索
    const result = await this.executor.spawn("gh", [
      "issue",
      "list",
      "--search",
      suggestion.title,
      "--json",
      "title",
      "--limit",
      "10",
    ]);

    if (result.exitCode !== 0) {
      return false;
    }

    const issues = JSON.parse(result.stdout);
    return issues.some(
      (issue: { title: string }) =>
        issue.title.toLowerCase() === suggestion.title.toLowerCase()
    );
  }

  private async createIssue(
    suggestion: ImprovementSuggestion
  ): Promise<string> {
    const body = this.buildIssueBody(suggestion);
    const labels = [
      ...this.config.labels,
      `priority:${suggestion.priority}`,
    ];

    if (suggestion.category) {
      labels.push(`category:${suggestion.category}`);
    }

    const result = await this.executor.spawn("gh", [
      "issue",
      "create",
      "--title",
      suggestion.title,
      "--body",
      body,
      "--label",
      labels.join(","),
    ]);

    if (result.exitCode !== 0) {
      throw new Error(`Issue作成に失敗: ${result.stderr}`);
    }

    // URLを抽出
    const match = result.stdout.match(/https:\/\/github\.com\/[^\s]+/);
    return match ? match[0] : result.stdout.trim();
  }

  private buildIssueBody(suggestion: ImprovementSuggestion): string {
    return `## 改善提案

### 概要
${suggestion.description}

### 優先度
${suggestion.priority}

### 関連ファイル
${suggestion.relatedFiles.map((file) => `- \`${file}\``).join("\n")}

### 提案者
ralph-loop (自動生成)

---
*このIssueは自動生成されました*
`;
  }
}
```

#### Loop Engineへの統合

```typescript
// src/core/loop.ts に追加

export async function runLoop(context: LoopContext): Promise<LoopResult> {
  // ... 既存のループ処理

  // ループ完了後に改善点を抽出
  const suggestions = await extractImprovements(context);

  // Issue自動作成
  if (config.autoIssue?.enabled) {
    const issueGenerator = new IssueGenerator(config.autoIssue);
    const createdIssues = await issueGenerator.createIssues(suggestions);
    
    logger.info(`${createdIssues.length}件のIssueを作成しました`);
  }

  return result;
}

async function extractImprovements(
  context: LoopContext
): Promise<ImprovementSuggestion[]> {
  // Scratchpadやイベント履歴から改善点を抽出
  // AIに改善点を要約させる処理を実装
  // （詳細設計で実装方法を決定）
  return [];
}
```

---

## 5. 機能一覧

| ID | 機能名 | 概要 | 優先度 | 実装モジュール |
|----|--------|------|--------|---------------|
| F-001 | Docker sandbox対応 | Dockerコンテナ内でのコード実行 | 必須 | DockerAdapter |
| F-002 | ホスト環境実行対応 | ホスト環境での直接コード実行 | 必須 | HostAdapter |
| F-003 | 実行環境選択機能 | config.yml/orch.ymlで実行環境種別を指定 | 必須 | SandboxFactory |
| F-004 | JSON Schema定義 | config.yml/orch.ymlのスキーマ定義 | 必須 | generate-schemas.ts |
| F-005 | スキーマ検証機能 | 起動時のYAML検証 | 必須 | validateConfig() |
| F-006 | 改善Issue自動作成 | ralph-loop実行時の自動Issue作成 | 重要 | IssueGenerator |
| F-007 | Issue作成条件設定 | 自動作成の有効/無効切り替え | 重要 | IssueGeneratorConfig |
| F-008 | 実行ログリアルタイム確認 | タスク実行中のAIエージェント出力をリアルタイムで確認 | 重要 | LogWriter, LogStreamer |

### 5.1 機能詳細

#### F-001: Docker sandbox対応

**概要**: Dockerコンテナ内でコードを実行するアダプターを実装

**処理フロー**:
```
1. 設定読み込み（image, network, timeout）
2. Docker利用可能性チェック
3. イメージ存在確認（なければpull）
4. docker runコマンド構築
   - --rm: 実行後に自動削除
   - -v: 作業ディレクトリをマウント
   - --network: ネットワーク制限
5. コマンド実行
6. 結果取得
```

**設定例**:
```yaml
sandbox:
  type: docker
  docker:
    image: node:20-alpine
    network: none
    timeout: 300
```

#### F-002: ホスト環境実行対応

**概要**: コンテナ環境が利用できない場合に、ホスト環境で直接コードを実行

**処理フロー**:
```
1. 設定読み込み（timeout, warnOnStart）
2. 初回実行時に警告表示（オプション）
3. sh -c でコマンド実行
4. 結果取得
```

**設定例**:
```yaml
sandbox:
  type: host
  host:
    timeout: 300
    warnOnStart: true
```

#### F-003: 実行環境選択機能

**概要**: 設定に基づいて適切なSandboxAdapterを選択・生成

**処理フロー**:
```
1. config.sandbox.type を読み取り
2. プライマリ環境の利用可能性チェック
3. 利用可能ならプライマリ環境を返す
4. 利用不可なら fallback 環境を試行
5. どちらも利用不可ならエラー
```

**設定例**:
```yaml
sandbox:
  type: docker
  fallback: host
```

#### F-004: JSON Schema定義

**概要**: zodスキーマからJSON Schemaを自動生成

**処理フロー**:
```
1. ConfigSchema（zod）を読み込み
2. zod-to-json-schema で変換
3. config.schema.json に出力
4. orch.schema.json に出力（同じ内容）
```

**生成コマンド**:
```bash
bun run generate:schemas
```

#### F-005: スキーマ検証機能

**概要**: CLI起動時にYAML設定をスキーマで検証

**処理フロー**:
```
1. YAMLファイルを読み込み
2. ConfigSchema.parse() で検証
3. エラーがあれば詳細を表示して終了
4. 成功ならConfigオブジェクトを返す
```

**エラー例**:
```
設定ファイルの検証に失敗しました:
  - sandbox.type: Invalid enum value. Expected 'docker' | 'container-use' | 'host', received 'invalid'
  - loop.max_iterations: Expected number, received string
```

#### F-006: 改善Issue自動作成

**概要**: ralph-loop実行時に改善点を自動的にGitHub Issueとして作成

**処理フロー**:
```
1. ループ完了後に改善点を抽出
2. 各改善点について:
   a. 優先度フィルタ（min_priority以上）
   b. 重複チェック（既存Issueを検索）
   c. Issue作成（gh issue create）
3. 作成されたIssue URLをログ出力
```

**Issue例**:
```markdown
## 改善提案

### 概要
エラーハンドリングが不十分です。タイムアウト時の処理を追加すべきです。

### 優先度
high

### 関連ファイル
- `src/core/loop.ts`
- `src/adapters/docker-adapter.ts`

### 提案者
ralph-loop (自動生成)
```

#### F-007: Issue作成条件設定

**概要**: 改善Issue自動作成の有効/無効を設定可能にする

**設定例**:
```yaml
autoIssue:
  enabled: true
  minPriority: medium
  labels:
    - auto-generated
    - improvement
```

#### F-008: 実行ログリアルタイム確認

**概要**: タスク実行中のAIエージェント出力をリアルタイムで確認

**処理フロー**:
```
1. タスクIDに対応するログファイルパスを特定
2. LogStreamer でログファイルを監視
3. 新しい出力があれば即座にコンソールに表示
4. タスク完了またはCtrl+Cで監視終了
```

**CLI例**:
```bash
# リアルタイム監視
orch logs -f -t <task-id>

# 過去のログを表示
orch logs -t <task-id>
```

**ログファイル構成**:
```
.agent/
├── <task-id>/
│   ├── output.log          # 全出力
│   ├── stdout.log          # 標準出力のみ
│   ├── stderr.log          # 標準エラー出力のみ
│   └── output_history.txt  # 既存：ループ検出用
```

---

## 6. データ設計

### 6.1 設定ファイル構造（orch.yml拡張）

```yaml
version: "1.0"

# バックエンド設定（既存）
backend:
  type: claude
  model: claude-sonnet-4-20250514

# サンドボックス設定（新規）
sandbox:
  type: docker  # docker | container-use | host
  fallback: host  # フォールバック先（オプション）

  # Docker設定
  docker:
    image: node:20-alpine
    network: none  # none | bridge | host
    timeout: 300

  # container-use設定（既存）
  containerUse:
    image: node:20
    envId: ""

  # ホスト環境設定
  host:
    timeout: 300
    warnOnStart: true

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

# 改善Issue自動作成（新規）
autoIssue:
  enabled: true
  minPriority: medium  # high | medium | low
  labels:
    - auto-generated
    - improvement

# 品質基準（既存）
quality:
  min_score: 8
  auto_approve_above: 9

# 状態管理（既存）
state:
  use_github_labels: true
  use_scratchpad: true
  scratchpad_path: ".agent/scratchpad.md"

# カスタムHat定義（既存）
hats:
  my_custom_hat:
    name: "🎯 My Hat"
    triggers: ["some.event"]
    publishes: ["another.event", "LOOP_COMPLETE"]
    instructions: |
      カスタムの指示をここに書く
```

### 6.2 TypeScript型定義（拡張）

```typescript
// src/core/types.ts に追加

export const SandboxConfigSchema = z.object({
  type: z.enum(["docker", "container-use", "host"]).default("container-use"),
  fallback: z.enum(["docker", "container-use", "host"]).optional(),
  docker: z.object({
    image: z.string().default("node:20-alpine"),
    network: z.enum(["none", "bridge", "host"]).optional(),
    timeout: z.number().default(300),
  }).optional(),
  containerUse: z.object({
    image: z.string().optional(),
    envId: z.string().optional(),
  }).optional(),
  host: z.object({
    timeout: z.number().default(300),
    warnOnStart: z.boolean().default(true),
  }).optional(),
});

export const AutoIssueConfigSchema = z.object({
  enabled: z.boolean().default(false),
  minPriority: z.enum(["high", "medium", "low"]).default("medium"),
  labels: z.array(z.string()).default(["auto-generated", "improvement"]),
});

export const ConfigSchema = z.object({
  version: z.string(),
  backend: BackendConfigSchema,
  sandbox: SandboxConfigSchema.optional(),
  loop: LoopConfigSchema,
  gates: GatesConfigSchema,
  autoIssue: AutoIssueConfigSchema.optional(),
  quality: QualityConfigSchema,
  state: StateConfigSchema,
  hats: z.record(HatSchema).optional(),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
export type AutoIssueConfig = z.infer<typeof AutoIssueConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
```

### 6.3 ログファイル構造

```
.agent/
├── <task-id>/
│   ├── output.log          # 全出力（stdout + stderr）
│   ├── stdout.log          # 標準出力のみ
│   ├── stderr.log          # 標準エラー出力のみ
│   ├── output_history.txt  # 既存：ループ検出用
│   ├── events.jsonl        # 既存：イベント履歴
│   ├── scratchpad.md       # 既存：Scratchpad
│   └── PROMPT.md           # 既存：プロンプト
```

**ログローテーション**:
- 各ログファイルは最大100MBまで
- 100MBを超えた場合は `.1`, `.2` とローテーション
- 最大5世代まで保持

---

## 7. インターフェース設計

### 7.1 CLI拡張

#### 新規コマンド

```bash
# ログ表示コマンド
orch logs [options]

Options:
  -t, --task <id>     タスクID
  -f, --follow        リアルタイムで監視
  -n, --lines <num>   表示する行数（デフォルト: 100）
  --stdout            標準出力のみ表示
  --stderr            標準エラー出力のみ表示
```

#### 既存コマンドへの影響

```bash
# runコマンド（変更なし）
orch run --issue <number> [options]

# statusコマンド（変更なし）
orch status --issue <number>

# eventsコマンド（変更なし）
orch events
```

### 7.2 外部システム連携

#### Docker CLI

```bash
# イメージ確認
docker image inspect <image>

# イメージ取得
docker pull <image>

# コンテナ実行
docker run --rm -i -v <workdir>:/workspace -w /workspace \
  --network <network> -e <env> <image> sh -c "<command>"
```

#### GitHub API（gh CLI経由）

```bash
# Issue作成
gh issue create \
  --title "<title>" \
  --body "<body>" \
  --label "<labels>"

# Issue検索
gh issue list \
  --search "<query>" \
  --json title \
  --limit 10
```

---

## 8. 非機能設計

### 8.1 パフォーマンス考慮事項

| 項目 | 目標値 | 対策 |
|------|--------|------|
| Docker起動時間 | 5秒以内 | イメージキャッシュ、軽量イメージ使用 |
| スキーマ検証時間 | 100ms以内 | zodの高速検証、キャッシュ活用 |
| Issue作成時間 | 3秒以内 | 並列処理、重複チェックの最適化 |
| ログ書き込みオーバーヘッド | 5%以内 | バッファリング、非同期書き込み |

### 8.2 セキュリティ考慮事項

| 項目 | 対策 |
|------|------|
| Dockerコンテナの隔離 | `--network none` でネットワーク制限、read-onlyマウント検討 |
| ホスト環境実行時の警告 | 初回実行時に必ず警告を表示、ドキュメントでリスク明記 |
| GitHub Token管理 | 環境変数または設定ファイル（.gitignore対象）、gh CLIの認証機構を利用 |
| 機密情報のログ出力禁止 | トークン、パスワードはマスク処理 |

### 8.3 可用性考慮事項

| 項目 | 対策 |
|------|------|
| コンテナ環境障害時のフォールバック | `fallback`設定で自動切り替え |
| GitHub API障害時の挙動 | エラーログ出力、処理は継続（Issue作成のみスキップ） |
| ログファイル書き込み失敗 | エラーログ出力、処理は継続 |

### 8.4 保守性考慮事項

| 項目 | 対策 |
|------|------|
| ProcessExecutor抽象化 | 将来のNode.js対応を容易にする |
| SandboxAdapter抽象化 | 新しいサンドボックス環境の追加を容易にする |
| 型安全性 | TypeScript strictモード、zodによる実行時検証 |
| テストカバレッジ | 80%以上を目標、モック化を容易にする設計 |

---

## 9. 制約事項・前提条件

### 9.1 技術的制約

| 制約 | 詳細 |
|------|------|
| ランタイム | Bun 1.0以上（専用） |
| Docker | Docker Engine 20.10以上（F-001使用時） |
| GitHub CLI | gh CLI 2.0以上（F-006使用時） |
| container-use | cu CLI（既存機能使用時） |

### 9.2 ビジネス上の制約

| 制約 | 詳細 |
|------|------|
| 予算 | なし（OSS） |
| スケジュール | Phase 1: 2週間、Phase 2: 1週間 |
| リソース | 開発者1名 |

### 9.3 前提条件

- Docker Engineがインストールされている（Docker sandbox使用時）
- GitHub Personal Access Tokenが発行されている（Issue自動作成使用時）
- Bunランタイムがインストールされている
- gh CLIがインストール・認証済み（Issue自動作成使用時）

---

## 10. リスクと対策

| リスク | 影響度 | 発生確率 | 対策 |
|--------|--------|---------|------|
| Docker未インストール環境での実行失敗 | 中 | 中 | host環境へのフォールバック機能を提供 |
| GitHub API rate limit超過 | 低 | 低 | リトライ機能、rate limit確認 |
| JSON Schemaとコードの不整合 | 中 | 中 | CI/CDでの自動検証、スキーマ生成の自動化 |
| Docker実行時のセキュリティリスク | 高 | 低 | ネットワーク制限、read-onlyマウント |
| ホスト環境実行時のセキュリティリスク | 高 | 中 | 警告表示必須、ドキュメントでリスク明記 |
| ログファイル肥大化 | 中 | 中 | ログローテーション、サイズ上限設定 |

---

## 11. 詳細設計書一覧

| # | 機能名 | パス | ステータス |
|---|--------|------|-----------|
| 1 | ProcessExecutor抽象化 | 未作成 | 未着手 |
| 2 | Docker Sandbox Adapter | 未作成 | 未着手 |
| 3 | Host Adapter | 未作成 | 未着手 |
| 4 | Sandbox Factory | 未作成 | 未着手 |
| 5 | Log Writer & Streamer | 未作成 | 未着手 |
| 6 | JSON Schema生成 | 未作成 | 未着手 |
| 7 | Issue Generator | 未作成 | 未着手 |

---

## 12. 実装優先順位

### Phase 1（必須機能）- 2週間

1. **Week 1**:
   - ProcessExecutor抽象化（2日）
   - SandboxAdapter抽象化（1日）
   - DockerAdapter実装（2日）
   - HostAdapter実装（1日）
   - SandboxFactory実装（1日）

2. **Week 2**:
   - JSON Schema生成スクリプト（1日）
   - スキーマ検証機能（1日）
   - LogWriter実装（2日）
   - LogStreamer実装（2日）
   - CLI統合（logs コマンド）（1日）

### Phase 2（重要機能）- 1週間

1. IssueGenerator実装（3日）
2. Loop Engineへの統合（2日）
3. テスト・ドキュメント整備（2日）

---

## 13. 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-24 | 初版作成 | AI Assistant |

---

## 14. 参考資料

### 14.1 技術ドキュメント

- [Docker Engine API](https://docs.docker.com/engine/api/)
- [GitHub REST API - Issues](https://docs.github.com/en/rest/issues)
- [JSON Schema Specification](https://json-schema.org/)
- [Zod Documentation](https://zod.dev/)
- [zod-to-json-schema](https://github.com/StefanTerdell/zod-to-json-schema)
- [YAML Language Server](https://github.com/redhat-developer/yaml-language-server)

### 14.2 既存実装参考

- `src/adapters/container.ts` - container-use実装
- `src/core/config.ts` - 設定読み込み実装
- `src/core/types.ts` - 型定義
- `src/core/exec.ts` - プロセス実行
- `src/core/logger.ts` - ログ管理

---

## 付録A: アーキテクチャ図（詳細）

### A.1 ProcessExecutor抽象化レイヤー

```
┌─────────────────────────────────────────────────────────────┐
│                   Application Layer                          │
│  (Loop Engine, Adapters, CLI)                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              ProcessExecutor Interface                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  spawn(command, args, options): Promise<Result>      │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              BunProcessExecutor (実装)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  - Bun.spawn ラッパー                                │   │
│  │  - タイムアウト処理                                  │   │
│  │  - stdin/stdout/stderr ハンドリング                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                       Bun.spawn
```

### A.2 Sandbox抽象化レイヤー

```
┌─────────────────────────────────────────────────────────────┐
│                   Loop Engine                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  SandboxFactory                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  create(config): Promise<SandboxAdapter>             │   │
│  │  - type判定                                          │   │
│  │  - 利用可能性チェック                                │   │
│  │  - フォールバック処理                                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              SandboxAdapter Interface                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  execute(command, options): Promise<Result>          │   │
│  │  cleanup(): Promise<void>                            │   │
│  │  isAvailable(): Promise<boolean>                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Docker     │    │ Container-   │    │    Host      │
│   Adapter    │    │ Use Adapter  │    │   Adapter    │
└──────────────┘    └──────────────┘    └──────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Docker CLI  │    │   cu CLI     │    │   sh -c      │
└──────────────┘    └──────────────┘    └──────────────┘
```

### A.3 ログ管理システム

```
┌─────────────────────────────────────────────────────────────┐
│                   Loop Engine                                │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                ▼                       ▼
┌─────────────────────────┐   ┌─────────────────────────┐
│      LogWriter          │   │    Console Logger       │
│  (ファイル書き込み)      │   │  (コンソール出力)       │
└─────────────────────────┘   └─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────┐
│              .agent/<task-id>/                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  output.log   - 全出力                               │   │
│  │  stdout.log   - 標準出力のみ                         │   │
│  │  stderr.log   - 標準エラー出力のみ                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   LogStreamer                                │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  stream(callback): Promise<void>                     │   │
│  │  - ファイル監視（tail -f相当）                       │   │
│  │  - リアルタイム出力                                  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    CLI (orch logs -f)
```

---

## 付録B: 設定ファイル例

### B.1 Docker環境での実行

```yaml
version: "1.0"

backend:
  type: claude

sandbox:
  type: docker
  fallback: host
  docker:
    image: node:20-alpine
    network: none
    timeout: 300

loop:
  max_iterations: 100

autoIssue:
  enabled: true
  minPriority: medium
  labels:
    - auto-generated
    - improvement
```

### B.2 ホスト環境での実行（開発用）

```yaml
version: "1.0"

backend:
  type: claude

sandbox:
  type: host
  host:
    timeout: 300
    warnOnStart: false  # 開発時は警告を抑制

loop:
  max_iterations: 50

autoIssue:
  enabled: false  # 開発時は無効
```

### B.3 container-use環境での実行（既存）

```yaml
version: "1.0"

backend:
  type: claude

sandbox:
  type: container-use
  containerUse:
    image: node:20

loop:
  max_iterations: 100

autoIssue:
  enabled: true
  minPriority: high
  labels:
    - auto-generated
    - critical
```

---

## 付録C: エラーメッセージ一覧

| エラーコード | メッセージ | 原因 | 対処法 |
|------------|-----------|------|--------|
| E001 | サンドボックス環境が利用できません | Docker/cu CLIが未インストール | Docker/cuをインストール、またはhost環境を使用 |
| E002 | 設定ファイルの検証に失敗しました | YAML構文エラー、型不一致 | エラーメッセージを確認して修正 |
| E003 | Issue作成に失敗しました | GitHub認証エラー、API制限 | gh auth login を実行、またはrate limitを確認 |
| E004 | ログファイルが見つかりません | タスクIDが不正、ログ未生成 | タスクIDを確認、タスクが実行されているか確認 |
| E005 | Dockerイメージの取得に失敗しました | ネットワークエラー、イメージ名不正 | ネットワーク接続を確認、イメージ名を確認 |

---

以上
