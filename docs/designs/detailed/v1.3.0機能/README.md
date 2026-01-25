# v1.3.0機能 詳細設計書インデックス

## メタ情報

| 項目 | 内容 |
|------|------|
| ドキュメントID | DETAILED-ORCH-002-INDEX |
| バージョン | 1.0.0 |
| 作成日 | 2026-01-25 |
| 関連基本設計書 | BASIC-ORCH-002 v1.0.0 |

---

## 関連ドキュメント

### 基本設計書
- [BASIC-ORCH-002_v1.3.0機能.md](../../basic/BASIC-ORCH-002_v1.3.0機能.md)

### 要件定義書
- [REQ-ORCH-001_追加仕様.md](../../../requirements/REQ-ORCH-001_追加仕様.md)

### v1.2.0詳細設計書（参考）
- [追加仕様/README.md](../追加仕様/README.md)

---

## 詳細設計書一覧

### pr-auto-merger/ - PR自動マージ機能（F-009）

| ファイル | 内容 |
|---------|------|
| 詳細設計書.md | 概要、スコープ、処理フロー、インターフェース定義 |
| バックエンド設計書.md | PRAutoMergerクラス実装仕様 |

### log-monitor/ - リアルタイムログ監視機能（F-010）

| ファイル | 内容 |
|---------|------|
| 詳細設計書.md | 概要、スコープ、処理フロー、インターフェース定義 |
| バックエンド設計書.md | LogMonitorクラス実装仕様 |

### issue-dependency/ - Issue依存関係管理機能（F-011）

| ファイル | 内容 |
|---------|------|
| 詳細設計書.md | 概要、スコープ、処理フロー、インターフェース定義 |
| バックエンド設計書.md | IssueDependencyResolverクラス実装仕様 |

### issue-status-label/ - Issueステータスラベル機能（F-012）

| ファイル | 内容 |
|---------|------|
| 詳細設計書.md | 概要、スコープ、処理フロー、インターフェース定義 |
| バックエンド設計書.md | IssueStatusLabelManagerクラス実装仕様 |

### 共通/

| ファイル | 内容 |
|---------|------|
| 型定義・共通処理設計書.md | PRConfigSchema, StateConfigSchema拡張, エラークラス追加 |
| セキュリティ設計書.md | GitHub Token管理、機密情報マスク |

---

## 機能一覧

| 機能ID | 機能名 | 優先度 | 設計書フォルダ |
|--------|--------|--------|---------------|
| F-009 | PR自動マージ機能 | 重要 | pr-auto-merger/ |
| F-010 | リアルタイムログ監視機能 | 重要 | log-monitor/ |
| F-011 | Issue依存関係管理機能 | 重要 | issue-dependency/ |
| F-012 | Issueステータスラベル機能 | 重要 | issue-status-label/ |

---

## 実装優先順位

### Phase 3（v1.3.0）

1. **共通基盤**
   - PRConfigSchema, StateConfigSchema拡張
   - 新規エラークラス（PRAutoMergeError等）

2. **コア機能**
   - PRAutoMerger（F-009）
   - LogMonitor（F-010）
   - IssueDependencyResolver（F-011）
   - IssueStatusLabelManager（F-012）

3. **CLI統合**
   - `--auto-merge` オプション
   - `logs --task --follow` オプション
   - `--resolve-deps`, `--ignore-deps`, `--check-deps` オプション

4. **Loop Engine統合**
   - ステータスラベル自動更新
   - PR自動マージ統合

---

## ステータス

| フォルダ | ステータス |
|---------|-----------|
| pr-auto-merger/ | ✅ 完了 |
| log-monitor/ | ✅ 完了 |
| issue-dependency/ | ✅ 完了 |
| issue-status-label/ | ✅ 完了 |
| 共通/ | ✅ 完了 |

---

## GitHub Issues

- **Epic Issue**: 未作成
- **子Issue**: 未作成

---

最終更新: 2026-01-25
