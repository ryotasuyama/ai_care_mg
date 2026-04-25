# 実装計画 05: コミュニケーション支援（メール返信）+ 運用仕上げ

**フェーズ番号**: 5 / 5（最終）
**想定 PR 数**: 7 件前後
**依存**: 計画 02 完了（`IEmailReplyDraftService` は計画 02 で実装済み）、計画 04 完了（主要機能完備）
**後続**: なし（MVP リリース）

---

## 1. 目的

メール返信ドラフト機能を仕上げ、運用観点（エラー監視・E2E テスト・本番デプロイ手順）を整えて**本番運用に乗せられる状態**を作る。

本計画完了時点のユーザー価値: 要件書 §4.5 のメール返信機能が動作し、クローズド β 運用が開始可能になる。エラーが Sentry に届き、主要フローが CI の E2E テストで常時検証される。

---

## 2. スコープ

### 含む
- `DraftEmailReplyUseCase` + Server Action + メール返信画面 UI
- Sentry SDK 導入（Server / Client / Edge）+ エラー捕捉 wrapper
- `error.tsx` エラーバウンダリ（App Router 規約）
- `ai_generation_logs` 集計用 SQL ビュー（日次コスト・レイテンシ）
- E2E テスト骨格（Playwright、主要 3 フロー）
- `README.md` 仕上げ + 本番デプロイ手順 + `CHANGELOG.md` 雛形

### 含まない
- 管理ダッシュボード（Grafana 連携などは将来対応、`care-manager-ai-design.md §10.6`）
- モニタリング自動アラート（Sentry のアラート設定は運用側で調整）
- プロンプト A/B テスト基盤（将来対応）

---

## 3. PR 分割案

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 1 | `[App]` | `DraftEmailReplyUseCase` + Server Action | `buildKnownPiiSetForTenant` → `IPiiMaskingService.mask`（受信メール本文に適用） → `IEmailReplyDraftService.draft` → `MaskingResult.unmask` でドラフトをアンマスク → `IAiGenerationLogRepository.save`（`kind='email_reply_draft'`、`original_text` は集約を持たないケースなので NOT NULL 保存）、`maskingStats` を UI 表示用に返す | `care-manager-ai-design.md §7.6.1` / `ai-support-context-design.md §6, §7` |
| 2 | `[UI]` | メール返信画面 | `/email-reply` ルート、受信メール本文貼付 textarea、任意の「返信方向性」入力、「ドラフト生成」ボタン、生成結果の subject / body 表示（アンマスク済み）、マスキング統計表示（検出件数をカテゴリ別）、コピーボタン、クリアボタン、**送信機能は持たない**（要件上コピペ運用） | 要件 §4.5 / `care-manager-ai-design.md §7.6` |
| 3 | `[Infra]` | Sentry 導入 + エラー捕捉 wrapper | `@sentry/nextjs` 導入、`sentry.server.config.ts` / `sentry.client.config.ts` / `sentry.edge.config.ts`、Server Action / API Route の共通 wrapper 関数で `UseCaseError` 以外を Sentry に送信、`UseCaseError` は期待内エラーとしてブレッドクラムのみ、環境変数（`SENTRY_DSN`）チェック | `care-manager-ai-design.md §10.6` |
| 4 | `[UI]` | `error.tsx` エラーバウンダリ + 共通エラー表示 | App Router の `error.tsx` をルート + 主要セクション配下に配置、`UseCaseErrorCode` マッピングに基づく日本語メッセージ、リトライボタン、エラー ID 表示（Sentry 参照用）、`not-found.tsx` も整備 | `care-manager-ai-design.md §7.8` |
| 5 | `[DB]` | `ai_generation_logs` 集計 SQL ビュー | `v_ai_generation_daily` ビュー（日次・kind 別の件数・合計トークン・平均レイテンシ）、Supabase Dashboard から定期クエリする前提、MVP では自動集計・可視化は含めない | `ai-support-context-design.md §5.4, §10.4` |
| 6 | `[Test]` | E2E テスト骨格 | Playwright の主要フロー 3 本: ①ログイン → 利用者登録 → 一覧表示、②アセスメント作成（音声入力モック + マスキングプレビュー + Gemini モック + 確定）、③ケアプラン作成（Finalized アセスメント → ドラフト生成モック → 採用 → 編集 → 確定）、各テストで RLS 検証を軽く混ぜる | `assessment-aggregate-design.md §9` / `care-plan-aggregate-design.md §9` |
| 7 | `[Docs]` | `README.md` 仕上げ + デプロイ手順 + CHANGELOG | ローカル起動手順の確定版、環境変数チェックリスト（`GEMINI_API_KEY` / `CRON_SECRET` / `SENTRY_DSN` / Supabase 系 4 つ）、Vercel Pro デプロイ手順、Supabase migration 適用手順、Cron 設定（`vercel.json` の最終形）、`CHANGELOG.md` 雛形（v0.1.0 リリースノート初稿） | - |

**PR サイズ目安**: すべて小さめ。PR 6（E2E）は 3 フロー分のテストコードで 500 行程度になりうるため、必要に応じてフロー別に 3 分割しても可。

---

## 4. 手動検証手順

前提: 計画 01〜04 完了、本番相当の Supabase プロジェクトと Vercel プロジェクトが用意済み。

### メール返信
1. `/email-reply` 画面を開く
2. 受信メール例を貼付: 「田中太郎様のご家族より。来週の訪問日を変更したいです。090-1234-5678 までご連絡ください。」
3. 「丁寧に日程調整を提案」を intent に入力 → 「ドラフト生成」
4. 数秒で返信ドラフト表示。本文には `{RECIPIENT_NAME_001}` 等ではなく元の表記に戻っていることを確認
5. マスキング統計が「利用者名: 1, 電話: 1」と表示される
6. 「コピー」ボタンでクリップボードに subject + body がコピーされる
7. Supabase Dashboard で `ai_generation_logs` に `kind='email_reply_draft'` の行、`original_text` NOT NULL / `masked_text` NOT NULL が確認できる

### 運用監視
8. 開発環境で意図的に `throw new Error('test-sentry')` を Server Action 内に仕込み実行 → Sentry ダッシュボードにイベントが届くことを確認
9. `UseCaseError('NOT_FOUND', '...')` を投げるケースを確認 → Sentry には送られず、画面にユーザー向けメッセージが出る
10. 存在しない利用者 ID で URL を叩く → `not-found.tsx` に遷移
11. Supabase Dashboard で `v_ai_generation_daily` ビューをクエリ → 本日のコール数・トークン合計・平均レイテンシが集計される

### E2E
12. `npm run test:e2e` をローカルで実行 → 3 フローすべて pass
13. CI で E2E ジョブが動き、main ブランチに対してグリーン

### デプロイ
14. README の手順に従い、新規マシンでクローン → 環境変数設定 → `supabase migration up` → `npm run dev` で起動できる
15. Vercel Preview にデプロイ → ログイン可能、Cron が動作開始、Sentry DSN が設定済み

---

## 5. 参照設計書

- `care-manager-ai-design.md §7.6`（コミュニケーション支援コンテキスト / `DraftEmailReplyUseCase`）
- `care-manager-ai-design.md §7.8`（エラーハンドリングマッピング）
- `care-manager-ai-design.md §10.6`（運用・監視未決定事項）
- `ai-support-context-design.md §3.5, §4.4, §6`（メール返信プロンプト・スキーマ・サービス）
- `ai-support-context-design.md §7, §10.4`（AI 生成ログ集計）
- 要件 `ai_care_mg.md §4.5`（メール返信機能）

---

## 6. 完了基準

- [ ] 全 PR がマージされ、CI がグリーン
- [ ] 手動検証手順 1〜15 が全て通る
- [ ] 本番 Vercel 環境でメール返信・アセスメント・ケアプラン生成がエンドツーエンドで動く
- [ ] Sentry にテスト例外が届き、UseCaseError は送られないこと（フィルタ動作）
- [ ] E2E テストが CI で 5 分以内に完走
- [ ] README の手順で新規開発者が 30 分以内にローカル起動できる
- [ ] `CHANGELOG.md` に v0.1.0（MVP 初回リリース）のエントリがある
- [ ] 次フェーズ（モニタリングダッシュボード・プロンプト改善など）の論点が `docs/` または Issue に記録されている

---

## 7. MVP リリース後のフォローアップ（参考）

本計画完了 = MVP リリース可能状態。リリース後の次フェーズ候補:

| 項目 | 参照 |
|------|------|
| `care-manager-ai-design.md §4.3.3` の `InReview` 実運用評価 | `care-plan-aggregate-design.md §5.4, §11` |
| RAG 再マスキング scope 絞り込み最適化 | `knowledge-context-design.md §7.3`, `care-manager-ai-design.md §10.3` |
| プロンプト精度フィードバック → few-shot 追加 | `ai-support-context-design.md §11` |
| ストリーミング表示対応 | `care-manager-ai-design.md §10.2` |
| PDF / Word エクスポート | 要件 §4.3 |
| モニタリングダッシュボード（Grafana 等） | `care-manager-ai-design.md §10.6` |
| 同姓同名利用者の区別 | `pii-masking-design.md §10` |

これらは MVP 後の運用知見を元に優先度を再評価する。
