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

## 完了チェックリスト（PR マージ前）

```bash
npx tsc --noEmit
npm run lint
npm run test
npm run build
# DB 変更がある場合のみ:
npx supabase db push --dry-run
```
