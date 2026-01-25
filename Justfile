# Orchestrator Hybrid - Development Commands
# https://github.com/casey/just

# デフォルトコマンド: ヘルプを表示
default:
    @just --list

# === セットアップ ===

# 依存関係インストール + スキーマ生成
setup:
    bun install
    bun run generate:schema

# 依存関係のみインストール
install:
    bun install

# === 開発 ===

# 開発モードでCLIを実行
dev *ARGS:
    bun run dev {{ARGS}}

# CLIを引数付きで実行（エイリアス）
run *ARGS:
    bun run dev {{ARGS}}

# === テスト ===

# テスト実行
test *ARGS:
    bun test {{ARGS}}

# テストをwatchモードで実行
test-watch:
    bun test --watch

# 特定ファイルのテスト実行
test-file FILE:
    bun test {{FILE}}

# === 品質チェック ===

# Lintチェック
lint:
    bun run lint

# フォーマット
format:
    bun run format

# 型チェック
typecheck:
    bun run typecheck

# 全品質チェック（lint + format + typecheck）
check: lint format typecheck

# === ビルド ===

# 現在のプラットフォーム用バイナリをビルド
build:
    bun run build:binary

# ビルドして /usr/local/bin にインストール（sudo必要）
install-global: build
    sudo cp ./orch /usr/local/bin/
    @echo "Installed: $(which orch)"
    @orch --version || true

# /usr/local/bin からアンインストール（sudo必要）
uninstall-global:
    sudo rm -f /usr/local/bin/orch
    @echo "Uninstalled orch from /usr/local/bin"

# JavaScriptにビルド
build-js:
    bun run build

# クロスプラットフォームビルド（全OS）
build-all: build build-linux build-macos build-windows

# Linux用バイナリをビルド
build-linux:
    bun run build:binary:linux

# macOS用バイナリをビルド
build-macos:
    bun run build:binary:macos

# Windows用バイナリをビルド
build-windows:
    bun run build:binary:windows

# === スキーマ ===

# JSON Schema生成
schema:
    bun run generate:schema

# === クリーンアップ ===

# ビルド成果物を削除
clean:
    rm -rf dist/
    rm -f orch orch-linux orch-macos orch.exe

# node_modulesを含めて完全クリーン
clean-all: clean
    rm -rf node_modules/
    rm -f bun.lockb

# === CI/CD ===

# CI用の全チェック（テスト + 品質チェック）
ci: check test

# リリース準備（チェック + ビルド）
release: ci build-all
    @echo "Release artifacts ready!"
    @ls -la orch* 2>/dev/null || true
