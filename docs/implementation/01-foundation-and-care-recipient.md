# 実装計画 01: 基盤と認証・テナント・利用者

**フェーズ番号**: 1 / 5
**想定 PR 数**: 15 件前後
**依存**: なし（先頭計画）
**後続**: 計画 02（AI 支援インフラ）

---

## 1. 目的

プロジェクト雛形と認証・テナント・利用者 CRUD までを立ち上げ、**「ログインして利用者を登録・閲覧・編集できる」**状態を作る。要介護度変更の履歴が DB トリガーで自動記録されることを確認する。

本計画完了時点のユーザー価値: 管理者が事業所を開設し、ケアマネを招待し、ケアマネが利用者台帳を運用できる。AI 機能はまだ動かない。

---

## 2. スコープ

### 含む
- Next.js App Router + Supabase + Tailwind のプロジェクト雛形
- CI（typecheck / lint / unit test / migration dry-run）
- DI コンテナ雛形（後続フェーズで埋める interface 前提の最小実装）
- テナント・ユーザーテーブル（`tenants` / `app_users`）+ Auth 同期 Trigger + 招待フロー
- `CareRecipient` 集約（ドメイン + リポジトリ + ユースケース + UI）
- `care_level_histories` テーブル + 自動記録 Trigger
- 認証ミドルウェア（未ログインを `/login` にリダイレクト）
- `buildKnownPiiSetForTenant` メソッド（実際の利用は計画 03）

### 含まない
- アセスメント、ケアプラン、ナレッジの機能
- Gemini API・PII マスキング・AI 生成ログ
- メール返信機能
- Sentry 導入（計画 05）

---

## 3. PR 分割案

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 1 | `[CI]` | プロジェクト scaffold | **前提**: `create-next-app` で Next.js 16.2.4 / React 19 / TypeScript strict / Tailwind v4 / ESLint v9 flat config（`eslint.config.mjs`）/ `src/` dir / import alias `@/*`→`./src/*` は scaffold 済み。**追加作業**: Prettier 導入（`prettier` + `eslint-config-prettier`）、Vitest セットアップ（`vitest` + `@vitejs/plugin-react`、`src/__tests__/` に smoke test 1 本）、Supabase CLI（`supabase` devDep + `supabase/` ディレクトリ初期化）、`.env.example`、`npm scripts`（`typecheck` / `test` / `db:*`）、GitHub Actions の typecheck / lint / test / build ワークフロー。**Tailwind v4 注意**: `tailwind.config.ts` は不要。`src/app/globals.css` に `@import "tailwindcss"` を用い、カスタム設計トークンは CSS 変数（`@theme { }` ブロック）で定義する。 | - |
| 2 | `[Docs]` | README 初期化 | ローカル起動手順、環境変数一覧、`docs/` への入口、ブランチ戦略の短文 | - |
| 3 | `[Domain]` | `domain/shared/` 基底型 | `TenantId` / `UserId` の値オブジェクト（`equals` / `toString`）、`DomainError` 基底、`ValidationError` / `IllegalStateTransitionError` の 3 基底例外 | `care-manager-ai-design.md §8`（ディレクトリ構成） |
| 4 | `[DB]` | migration `001_tenants_and_app_users.sql` | `tenants` / `app_users` DDL、ロール CHECK、RLS、`handle_new_auth_user()` Trigger 関数、Storage バケット作成（将来のナレッジ用に準備のみ） | `care-manager-ai-design.md §5.1.1` |
| 5 | `[Infra]` | Supabase クライアント + `getCurrentAuth` | `@supabase/ssr` の `createServerClient` / `createBrowserClient` ラッパ、Service Role クライアントの分離、`getCurrentAuth` が `AuthorizationContext` を返す | `care-manager-ai-design.md §7.5.1` |
| 6 | `[UI]` | ログインフォーム + ログアウト Server Action | 自前フォーム（Supabase Auth UI 不使用）、メール + パスワード、Cookie ベースセッション、エラー表示 | 要件 §4.1 |
| 7 | `[App+UI]` | 認証ミドルウェア | `middleware.ts` で `/login` 以外の全ルートをガード、未ログインはリダイレクト、`AuthorizationContext` を request header に注入 | `care-manager-ai-design.md §10.4` |
| 8 | `[Infra]` | DI コンテナ雛形 | `infrastructure/di/container.ts`、登録すべき interface のプレースホルダ、リクエストスコープの作り方 | `care-manager-ai-design.md §8` |
| 9 | `[DB]` | migration `002_care_recipients_and_histories.sql` | `care_recipients` DDL + CHECK + RLS、`care_level_histories` DDL + インデックス + RLS、`record_care_level_change()` Trigger | `care-manager-ai-design.md §5.1.2, §5.2` |
| 10 | `[Domain]` | `CareRecipient` 集約 | `CareLevel` 値オブジェクト（7 段階）、`FamilyMember` 値オブジェクト、`CareRecipient` ルート（ファクトリ + 不変条件 + `ageRange` 算出） | `care-manager-ai-design.md §4.3` |
| 11 | `[Infra]` | `SupabaseCareRecipientRepository` + Mapper | `ICareRecipientRepository` の全メソッド実装、`CareRecipientMapper`（ドメイン ↔ DB 行）、`buildKnownPiiSetForTenant`（エイリアス生成も） | `care-manager-ai-design.md §4.3.4, §6` |
| 12 | `[App]` | 利用者 CRUD ユースケース | `RegisterCareRecipientUseCase` / `UpdateCareRecipientUseCase` / `GetCareRecipientUseCase` / `ListCareRecipientsUseCase`、各 DTO、Server Actions | `care-manager-ai-design.md §7.1, §7.2, §7.8` |
| 13 | `[UI]` | 利用者画面（一覧・登録・詳細・編集） | `/care-recipients` ルート群、RSC でのデータ取得（読み取りは直接ユースケース呼出）、書き込みは Server Action、家族情報の追加/削除フォーム | `care-manager-ai-design.md §10.4` |
| 14 | `[App+UI]` | 招待フロー | 管理者用の招待 Server Action（`supabase.auth.admin.inviteUserByEmail` + `raw_user_meta_data` に `tenant_id` / `role`）、被招待者のパスワード初期化画面、ロール判定ユーティリティ | `care-manager-ai-design.md §10.5` |
| 15 | `[Test]` | E2E smoke テスト | Playwright セットアップ、「ログイン → 利用者登録 → 編集 → 要介護度変更 → 履歴自動記録」のフローテスト、CI への組込 | - |

**PR サイズ目安**: 1 PR あたり 300〜500 行変更以内。PR 10（CareRecipient 集約）と PR 13（UI 一式）は上限超過の可能性があるため、必要に応じてさらに分割（例: 一覧/詳細 と 登録/編集 を別 PR に）。

---

## 4. 手動検証手順

前提: Supabase プロジェクトが作成済み、CLI ログイン済み。

1. `supabase migration up` で 001 / 002 を適用
2. Supabase Dashboard → Authentication で事業所 admin を手動作成し、`tenants` に 1 行 INSERT、`app_users` も手動 INSERT（Trigger を通すため、Dashboard の「Invite user」で `raw_user_meta_data` を渡す方式でもよい）
3. `npm run dev` で起動 → `/login` でログイン
4. `/care-recipients` で利用者を 1 人登録 → 一覧に表示
5. 詳細画面を開き、要介護度を `care_2` → `care_3` に変更 → 保存
6. Supabase Dashboard で `care_level_histories` を開き、行が増えていること、`previous_care_level` / `new_care_level` が正しいことを確認
7. 別テナントのユーザーでログインし直し、上記利用者が見えないこと（RLS）を確認
8. 管理者画面で別のメールアドレスを招待 → 招待メール受信 → パスワード設定 → ログイン可能なこと

---

## 5. 参照設計書

- `ai_care_mg.md §4.1`（要件: 認証・ユーザー管理）
- `care-manager-ai-design.md §3`（境界づけられたコンテキスト）
- `care-manager-ai-design.md §4.3`（利用者集約）
- `care-manager-ai-design.md §5.1.1`（tenants / app_users DDL + Auth Trigger）
- `care-manager-ai-design.md §5.1.2`（care_recipients DDL）
- `care-manager-ai-design.md §5.2`（care_level_histories + Trigger）
- `care-manager-ai-design.md §7.1, §7.2`（ユースケース原則・共通型）
- `care-manager-ai-design.md §7.5, §7.5.1`（Server Action + Supabase クライアント使い分け）
- `care-manager-ai-design.md §7.8`（エラーハンドリング）
- `care-manager-ai-design.md §8`（ディレクトリ構成）
- `care-manager-ai-design.md §10.5`（招待フロー）

---

## 6. 完了基準

- [ ] 全 PR がマージされ、CI がグリーン
- [ ] 手動検証手順 1〜8 が全て通る
- [ ] `migrations/` に 001 / 002 が登録済み、`supabase migration up` が冪等に動く
- [ ] ログイン後の任意ページで、`AuthorizationContext` が DI コンテナから取得可能
- [ ] 後続計画（計画 02）のために、DI コンテナに `IAiSummarizationService` 等のプレースホルダ登録ポイントが確保されている
