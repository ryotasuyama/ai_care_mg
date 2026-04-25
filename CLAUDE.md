@AGENTS.md

# ai_care_mg — プロジェクト規約

## アーキテクチャ

**Server-first（RSC + Server Actions）— SPA ではない。**

- デフォルトは Server Component。`'use client'` は状態・イベントハンドラが必要な最小スコープのみ
- ミューテーションは Server Actions（`'use server'`）で実装。API Route は使わない
- API Route の用途: ファイルアップロードと Vercel Cron のみ
- クライアント状態管理ライブラリ（Zustand 等）は不使用

## データベース（Supabase）

**Prisma 不使用。** Supabase RLS・pgvector・RPC 関数を直接使う。

- クライアント: `@supabase/supabase-js`
- 型: `supabase gen types typescript --local > src/types/database.ts`（手書き禁止）
- マイグレーション: `supabase/migrations/NNN_description.sql`（連番、`supabase db diff` で生成）
- 全テーブルに `tenant_id` カラムと RLS ポリシーを必須とする

## ディレクトリ構造

```
src/
├── app/                        # Next.js App Router（ページ・レイアウト・Server Actions）
├── domain/
│   ├── care-management/        # 被介護者・ケアプラン・アセスメント
│   ├── knowledge/              # RAG ナレッジベース
│   ├── ai-support/             # Gemini 連携・PII マスキング
│   ├── tenant-auth/            # テナント・ユーザー管理
│   └── communication/          # メール下書き生成
├── usecase/
├── infrastructure/
│   ├── supabase/
│   ├── gemini/
│   └── di/                     # container.ts
└── types/
    └── database.ts             # 自動生成（編集禁止）
```

新しいドメインロジックは `domain/` 配下に配置。`app/` にビジネスロジックを書かない。

## テスト

- ランナー: Vitest（単体・統合）、Playwright（E2E）
- **ドメイン層**: test-first 必須（Red → Green → Refactor）。テストファイルを実装より先に作る
- **ユースケース層**: 実装と同一 PR でテスト作成
- **インフラ層**: `vi.mock('@supabase/supabase-js')` でモック
- **UI 層**: 単体テスト不要（E2E でカバー）

## コーディング規約

- バリデーション: Zod。型は `z.infer<typeof schema>` で導出（手書き interface 禁止）
- エラーハンドリング: `Result<T, E>` パターン。`throw` は外部 API 境界のみ
- 環境変数: `src/config.ts` に集約して型付き export（コンポーネントで `process.env` 直参照禁止）
- AI プロンプト: `src/prompts/v1/` に versioned テンプレートとして管理

## PR ワークフロー

- ブランチ: `task-N` または `feat/description`
- PR タイトルプレフィックス: `[Domain]` / `[Usecase]` / `[Infra]` / `[App]` / `[UI]` / `[Test]` / `[DB]` / `[CI]` / `[Docs]`
- PR サイズ目標: 300〜500 行

## GitHub 操作

### git worktree — 複数ブランチの同時編集

別ブランチの作業を並行して進める際は `git checkout` で切り替えず、`git worktree` を使う。

```bash
# 既存ブランチを別ディレクトリで開く
git worktree add ../ai_care_mg-<branch-name> <branch-name>

# 新ブランチを作りながら別ディレクトリで開く
git worktree add -b feat/new-feature ../ai_care_mg-feat-new-feature main

# 一覧確認
git worktree list

# 作業完了後に削除
git worktree remove ../ai_care_mg-<branch-name>
```

**運用ルール**

- worktree ディレクトリ名は `../ai_care_mg-<branch-name>` に統一する
- 各 worktree で `npm install` が必要（`node_modules` は共有されない）
- `.env.local` は gitignore 対象のため手動コピーする
- worktree を削除する前にブランチが不要でないか確認する

### GitHub CLI (gh)

```bash
# PR 作成（タイトルプレフィックスは既存ルール参照）
gh pr create --title "[Domain] 説明" --base main

# PR 一覧・詳細確認
gh pr list
gh pr view [番号]
gh pr view --web   # ブラウザで開く

# CI ステータス確認
gh pr checks

# レビュー依頼
gh pr edit --add-reviewer <username>

# PR マージ（squash merge を使う）
gh pr merge --squash --delete-branch

# Issue 確認・作成
gh issue list
gh issue create
```

### コンフリクト解消手順

`merge commit` を作らず、`rebase` で解消する。

```bash
# 1. main の最新を取得
git fetch origin main

# 2. 現在のブランチを main に rebase
git rebase origin/main

# 3. コンフリクトを解消後
git add <解消したファイル>
git rebase --continue

# 4. force push（--force は使わず --force-with-lease を使う）
git push --force-with-lease
```

- rebase 中に問題が起きた場合: `git rebase --abort` で元の状態に戻す
- `--force-with-lease` は他の人が push していた場合に失敗するため、上書き事故を防ぐ

## 完了チェックリスト（PR マージ前）

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
# DB 変更がある場合のみ:
npx supabase db push --dry-run
```
