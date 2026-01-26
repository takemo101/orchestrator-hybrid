# v1.4.0機能 詳細設計書

## 概要

orchestrator-hybrid v1.4.0 (Phase 4) の詳細設計書群です。

## 関連ドキュメント

| ドキュメント | パス |
|-------------|------|
| 要件定義書 | `docs/requirements/REQ-ORCH-001_追加仕様.md` (v1.4.0) |
| 基本設計書 | `docs/designs/basic/BASIC-ORCH-004_v1.4.0機能.md` |

## フォルダ構成

| フォルダ/ファイル | 説明 |
|------------------|------|
| `v1.4.0機能/` | ルートフォルダ |
| `README.md` | このファイル |
| `per-hat-model-selection/` | F-013: Per-Hat/Step Model Selection |
| `memories-system/` | F-014: Memories System |
| `tasks-system/` | F-015: Tasks System |
| `session-recording/` | F-016: Session Recording |
| `multi-loop-concurrency/` | F-017: Multi-Loop Concurrency |
| `per-hat-backend/` | F-018: Per-Hat Backend Configuration |
| `custom-backends/` | F-019: Custom Backends |
| `event-emission-cli/` | F-020: Event Emission CLI |
| `glob-pattern-matching/` | F-021: Glob Pattern Event Matching |
| `共通/` | 共通設計書（型定義、セキュリティ） |

各機能フォルダには `詳細設計書.md` と `バックエンド設計書.md` が含まれます。

## 機能一覧

| 機能ID | 機能名 | フォルダ | 優先度 |
|--------|--------|----------|--------|
| F-013 | Per-Hat/Step Model Selection | per-hat-model-selection/ | 必須 |
| F-014 | Memories System | memories-system/ | 必須 |
| F-015 | Tasks System | tasks-system/ | 必須 |
| F-016 | Session Recording | session-recording/ | 必須 |
| F-017 | Multi-Loop Concurrency | multi-loop-concurrency/ | 重要 |
| F-018 | Per-Hat Backend Configuration | per-hat-backend/ | 重要 |
| F-019 | Custom Backends | custom-backends/ | 重要 |
| F-020 | Event Emission CLI | event-emission-cli/ | 重要 |
| F-021 | Glob Pattern Event Matching | glob-pattern-matching/ | 中 |

## 実装優先順位

### 必須機能（先行実装）

1. **F-013 Per-Hat Model Selection** - 他機能の基盤となるモデル選択機構
2. **F-014 Memories System** - セッション間の学習永続化
3. **F-015 Tasks System** - タスク依存関係管理
4. **F-016 Session Recording** - デバッグ・テスト基盤

### 重要機能（続行実装）

5. **F-017 Multi-Loop Concurrency** - 並列実行基盤（F-014に依存）
6. **F-018 Per-Hat Backend** - F-013の拡張
7. **F-019 Custom Backends** - F-018の拡張
8. **F-020 Event Emission CLI** - イベントシステム拡張
9. **F-021 Glob Pattern Matching** - F-020の拡張

## 変更履歴

| バージョン | 日付 | 変更内容 | 作成者 |
|-----------|------|----------|--------|
| 1.0.0 | 2026-01-26 | 初版作成（フォルダ構造定義） | AI Assistant |
