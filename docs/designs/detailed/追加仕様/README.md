# 詳細設計書インデックス

## 基本設計書
- [BASIC-ORCH-001_追加仕様.md](../../basic/BASIC-ORCH-001_追加仕様.md)

## 要件定義書
- [REQ-ORCH-001_追加仕様.md](../../../requirements/REQ-ORCH-001_追加仕様.md)

---

## 詳細設計書一覧

### sandbox/ - 実行環境関連
| ファイル | 機能ID | 内容 |
|---------|--------|------|
| 詳細設計書.md | F-001, F-002, F-003 | 概要、スコープ、処理フロー、インターフェース定義 |
| バックエンド設計書.md | F-001, F-002, F-003 | ProcessExecutor、各Adapter、Factoryの実装仕様 |

### schema/ - スキーマ関連
| ファイル | 機能ID | 内容 |
|---------|--------|------|
| JSONSchema生成設計書.md | F-004 | zod-to-json-schemaによる自動生成 |
| スキーマ検証設計書.md | F-005 | 起動時YAML検証 |

### logging/ - ログ関連
| ファイル | 機能ID | 内容 |
|---------|--------|------|
| LogWriter設計書.md | F-008 | ファイル書き込み |
| LogStreamer設計書.md | F-008 | リアルタイム読み取り |

### issue-generator/ - Issue自動作成関連
| ファイル | 機能ID | 内容 |
|---------|--------|------|
| 詳細設計書.md | F-006, F-007 | 改善Issue自動作成（概要・フロー） |
| バックエンド設計書.md | F-006, F-007 | IssueGeneratorクラス詳細仕様 |

### 共通/
| ファイル | 内容 |
|---------|------|
| 型定義・共通処理設計書.md | ProcessExecutor抽象化、型定義拡張、エラーハンドリング |

---

## 実装優先順位

### Phase 1（2週間）
1. ProcessExecutor抽象化
2. SandboxAdapter/Factory
3. DockerAdapter
4. HostAdapter
5. JSON Schema生成
6. スキーマ検証
7. LogWriter/LogStreamer

### Phase 2（1週間）
1. IssueGenerator
2. Issue作成条件設定

---

## ステータス

| フォルダ | ステータス |
|---------|-----------|
| sandbox/ | ✅ 完了 |
| schema/ | ✅ 完了 |
| logging/ | ✅ 完了 |
| issue-generator/ | ✅ 完了 |
| 共通/ | ✅ 完了 |

---

## GitHub Issues

- **Epic Issue**: [#4 - [Epic] orchestrator-hybrid 追加仕様 v1.2.0](https://github.com/takemo101/orchestrator-hybrid/issues/4)
- **子Issue数**: 17件（#5〜#21）

### 子Issue一覧

| Issue | タイトル | 機能ID |
|-------|---------|--------|
| #5 | ProcessExecutor インターフェース定義 | F-001 |
| #6 | BunProcessExecutor 実装 | F-001 |
| #7 | SandboxError エラークラス階層 | F-001 |
| #8 | SandboxAdapter インターフェース定義 | F-003 |
| #9 | DockerAdapter 実装 | F-001 |
| #10 | HostAdapter 実装 | F-002 |
| #11 | ContainerAdapter リファクタリング | F-003 |
| #12 | SandboxFactory 実装 | F-003 |
| #13 | types.ts 拡張 | F-003 |
| #14 | JSON Schema 生成スクリプト | F-004 |
| #15 | 起動時スキーマ検証機能 | F-005 |
| #16 | LogWriter 実装 | F-008 |
| #17 | LogStreamer 実装 | F-008 |
| #18 | logs コマンド拡張 | F-008 |
| #19 | IssueGenerator 実装 | F-006 |
| #20 | ループエンジン統合 | F-003 |
| #21 | ドキュメント更新 | - |

---

最終更新: 2026-01-24
