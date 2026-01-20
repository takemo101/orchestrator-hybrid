# Orchestrator Hybrid

Ralph OrchestratorとComposer Workflowの良いとこ取りをした新しいAIエージェントオーケストレーター。

## 特徴

| 機能 | 由来 |
|------|------|
| 自動ループ実行 | Ralph |
| Hatシステム（役割分離） | Ralph |
| GitHub Issue統合 | Composer |
| 承認ゲート | Composer |
| マルチバックエンド | Ralph |

## クイックスタート

```bash
./scripts/orch.sh run --issue 123
```

## 使用方法

```bash
./scripts/orch.sh run --issue <number> [options]

# オプション
--backend, -b    バックエンド: claude, opencode (default: claude)
--max-iterations 最大反復回数 (default: 100)
--auto, -a       承認ゲートを自動承認
--verbose, -v    詳細ログ

# 例
./scripts/orch.sh run --issue 123 --auto
./scripts/orch.sh run --issue 123 --backend opencode
./scripts/orch.sh status --issue 123
```

## 実装フェーズ

- [x] Phase 1: シェルスクリプトプロトタイプ
- [ ] Phase 2: TypeScriptコア実装
- [ ] Phase 3: 承認ゲート実装
- [ ] Phase 4: 完全統合

## 設計ドキュメント

詳細は [DESIGN.md](./DESIGN.md) を参照。

## 依存関係

- `gh` (GitHub CLI)
- `jq`
- `claude` or `opencode`

## ライセンス

MIT
