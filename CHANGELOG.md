# Changelog

## v0.1.0 — 2026-04-26 (MVP)

### 追加機能

#### 利用者管理
- 利用者（被介護者）の登録・編集・一覧表示
- 要介護度・住所・家族情報・電話番号の管理
- テナント（事業所）ごとのデータ分離（RLS）

#### アセスメント支援
- 音声入力（Web Speech API）によるアセスメント記録
- 個人情報（氏名・電話番号・住所等）の 2 段階 PII マスキング
- Gemini API による AI 要約（マスキング済みテキストを送信）
- 課題（issue）の追加・編集・削除
- アセスメントの確定（Finalized）

#### ケアプラン生成支援
- Finalized アセスメントからのケアプランドラフト自動生成
- RAG（pgvector）による事業所ナレッジの参照
- 長期目標・短期目標・サービス項目の AI 提案
- ケアプランの編集・確定・アーカイブ・後継計画作成

#### メール返信ドラフト生成（NEW）
- 受信メール本文を貼り付けるだけで AI が返信ドラフトを生成
- テナント内の全利用者 PII をマスクして Gemini に送信（個人情報保護）
- マスキング統計表示（カテゴリ別検出件数）
- 生成結果を件名・本文で表示し、クリップボードへコピー可能

#### ナレッジ管理
- PDF・テキストファイルのアップロード・チャンク分割・埋め込みベクトル生成
- Vercel Cron による定期的なエンベディング処理

#### 運用基盤
- Sentry によるエラー監視（UseCaseError はフィルタ、予期しないエラーのみ送信）
- `v_ai_generation_daily` ビューによる AI 呼び出し日次集計
- E2E テスト骨格（Playwright）
- App Router `error.tsx` / `not-found.tsx` エラーページ

### 技術スタック
- Next.js 16 (App Router, React Server Components + Server Actions)
- Supabase (PostgreSQL + RLS + pgvector)
- Google Gemini API (gemini-1.5-flash / text-embedding-004)
- Tailwind CSS v4
- Vitest + Playwright
- Sentry

### 既知の制限（v0.1.0）
- メール送信機能なし（コピペ運用）
- 管理ダッシュボードなし（AI コスト・レイテンシは Supabase Dashboard から手動確認）
- プロンプト A/B テスト基盤なし
- ストリーミング表示なし（生成完了まで待機）
- ケアプランの PDF / Word エクスポートなし
