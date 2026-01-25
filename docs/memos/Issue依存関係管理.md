## Issue依存関係管理機能（Issue #46）

### 概要
Issue 間に依存関係がある場合、依存 Issue が完了してから実行する機能。

### ユースケース

#### 1. 依存 Issue が未完了なら実行しない
```bash
orch run --issue 45 --auto
# → Issue #45 が Issue #44 に依存している場合
# → "Issue #44 is not completed. Aborting." と表示して終了
```

#### 2. 依存 Issue を先に実行してから実行
```bash
orch run --issue 45 --auto --resolve-deps
# → Issue #44 を先に実行 → 完了後に Issue #45 を実行
```

#### 3. 複数 Issue を依存順にソートして実行
```bash
orch run --issues 44,45,46 --auto
# → 依存関係をトポロジカルソートして実行順を決定
```

### 依存関係の取得方法

**GitHub Issue Dependencies API（2025年8月GA）を使用**

Reference: https://docs.github.com/en/rest/issues/issue-dependencies

```bash
# このIssueをブロックしているIssue一覧（blocked by）
gh api "repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocked_by" \
  --jq '.[] | {number, title, state}'

# このIssueがブロックしているIssue一覧（blocking）
gh api "repos/{owner}/{repo}/issues/{issue_number}/dependencies/blocking" \
  --jq '.[] | {number, title, state}'
```

### CLI オプション
| オプション | 説明 |
|-----------|------|
| `--resolve-deps` | 依存 Issue を先に実行 |
| `--ignore-deps` | 依存関係を無視して実行 |
| `--check-deps` | 依存関係のみチェック（実行しない） |

### 実装方針
- `src/input/dependency.ts` - 依存関係取得・解析（GitHub API使用）
- `src/core/dependency-resolver.ts` - トポロジカルソート、実行順決定
- 循環依存を検出したらエラー

### 参考
- composer-workflow の skill: `.opencode/skill/github-issue-dependency/`

### 参照
- GitHub Issue: https://github.com/takemo101/orchestrator-hybrid/issues/46
