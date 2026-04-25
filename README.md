# ケアマネAI

ケアマネジャー向け AI 支援 Web アプリ（MVP）

## 技術スタック

- **フレームワーク**: Next.js 16.2.4 (App Router, React 19)
- **DB / Auth**: Supabase (PostgreSQL + RLS + pgvector)
- **スタイリング**: Tailwind CSS v4
- **バリデーション**: Zod v4
- **テスト**: Vitest（単体）/ Playwright（E2E）
- **言語**: TypeScript（strict）

## ローカル起動

### 前提

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase` または `brew install supabase/tap/supabase`)
- Docker（Supabase ローカル起動に必要）

### 手順

```bash
# 1. 依存パッケージをインストール
npm install

# 2. 環境変数を設定
cp .env.example .env.local
# .env.local を編集（後述の「環境変数」セクション参照）

# 3. Supabase ローカル環境を起動
npm run db:start
# → http://localhost:54323 で Studio にアクセス可能

# 4. マイグレーションを適用
npm run db:reset
# または初回のみ: supabase db push

# 5. 型定義を再生成（マイグレーション変更後に実行）
npm run db:types

# 6. 開発サーバーを起動
npm run dev
# → http://localhost:3000
```

## 環境変数

`.env.local` に以下を設定する。

```env
# Supabase（ローカル起動時は supabase start の出力値を使用）
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase start の anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase start の service_role key>

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

> **本番環境（Vercel）**: Supabase ダッシュボードの Project Settings → API から取得した値を Vercel の環境変数に設定する。

## 初回データ投入（ローカル）

Supabase Studio（`http://localhost:54323`）で以下を手動実行する。

```sql
-- 1. テナント（事業所）を作成
INSERT INTO tenants (name) VALUES ('テスト事業所') RETURNING id;

-- 2. Supabase Dashboard → Authentication → Users で管理者ユーザーを招待
--    raw_user_meta_data に以下を設定（または inviteUserByEmail を使用）:
--    { "tenant_id": "<上記の id>", "role": "admin", "display_name": "管理者" }
```

その後 `/login` でログインすると `/care-recipients` にリダイレクトされる。

## npm scripts

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー起動 |
| `npm run build` | プロダクションビルド |
| `npm run typecheck` | TypeScript 型チェック |
| `npm run lint` | ESLint |
| `npm run test` | Vitest 単体テスト |
| `npm run test:watch` | Vitest ウォッチモード |
| `npm run db:start` | Supabase ローカル起動 |
| `npm run db:stop` | Supabase ローカル停止 |
| `npm run db:reset` | マイグレーション全適用（データリセット） |
| `npm run db:push` | リモートへマイグレーション適用 |
| `npm run db:push:dry` | dry-run（変更内容の確認のみ） |
| `npm run db:types` | Supabase 型定義を自動生成 |
| `npm run e2e` | Playwright E2E テスト |

## ブランチ戦略

- `main`: 常にデプロイ可能な状態を維持
- `task-N`: 計画 N の実装ブランチ
- `feat/description`: 機能追加ブランチ

PR タイトルプレフィックス: `[Domain]` / `[Usecase]` / `[Infra]` / `[App]` / `[UI]` / `[Test]` / `[DB]` / `[CI]` / `[Docs]`

## ドキュメント

| ファイル | 内容 |
|---|---|
| `docs/care-manager-ai-design.md` | 全体設計（コンテキスト・利用者集約・共通原則） |
| `docs/ai_care_mg.md` | 要件定義書 |
| `docs/implementation/01-foundation-and-care-recipient.md` | 実装計画 01（本フェーズ） |
| `docs/implementation/02-ai-support-infrastructure.md` | 実装計画 02（次フェーズ） |

## ディレクトリ構成（概要）

```
src/
├── app/                  # Next.js App Router（ページ・Server Actions）
├── application/          # ユースケース層
│   ├── care-management/
│   └── shared/           # AuthorizationContext, IUseCase, UseCaseError
├── domain/               # ドメイン層（フレームワーク非依存）
│   ├── care-management/
│   └── shared/           # TenantId, UserId, DomainError
├── infrastructure/       # 実装層
│   ├── supabase/         # サーバー・ブラウザクライアント
│   ├── repositories/     # SupabaseCareRecipientRepository
│   ├── auth/             # getCurrentAuth
│   └── di/               # DI コンテナ
├── components/           # 共通 UI コンポーネント
├── types/
│   └── database.ts       # Supabase 自動生成型（編集禁止）
└── config.ts             # 環境変数の集約
```

## PR マージ前チェックリスト

```bash
npm run typecheck
npm run lint
npm run test
npm run build
# DB 変更がある場合のみ:
npm run db:push:dry
```
