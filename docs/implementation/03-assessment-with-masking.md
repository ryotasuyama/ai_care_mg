# 実装計画 03: アセスメント集約 + PII マスキング 2 段階統合

**フェーズ番号**: 3 / 5
**想定 PR 数**: 15 件前後
**依存**: 計画 01 完了（認証 + 利用者）、計画 02 完了（AI 支援インフラ + マスキング）
**後続**: 計画 04（ケアプラン生成はアセスメント Finalized に依存）

---

## 1. 目的

音声入力 → マスキング準備 → 人手確認ゲート → AI 要約 → アセスメント集約生成・編集・確定、を通しで動かす。計画 02 で作った AI 支援インフラと PII マスキングサービスを**初めてユースケース層から呼び出す**フェーズ。

本計画完了時点のユーザー価値: ケアマネが訪問記録を音声で取り、AI が課題・ニーズを構造化し、人手で編集・確定できるようになる。**ケアプラン生成の前提となる「Finalized アセスメント」が作成可能**になる。

---

## 2. スコープ

### 含む
- `assessments` / `assessment_issues` / `assessment_drafts` テーブル + `save_assessment` RPC + TTL 失効 pg_cron
- `Assessment` 集約（ドメイン + リポジトリ）+ `PlaceholderMapSnapshot` 値オブジェクト
- `AssessmentIssue` 子エンティティ
- 4 つのユースケース: `PrepareAssessmentDraftUseCase` / `GenerateAssessmentFromMaskedTextUseCase` / `GetAssessmentForViewUseCase` / `FinalizeAssessmentUseCase`
- 音声入力コンポーネント（Web Speech API）+ 精度不足時の手動編集
- マスキングプレビュー画面（原文 ↔ マスク後の 2 ペイン + 差分ハイライト + 手動追加マスク）
- アセスメント一覧・詳細・編集画面（アンマスク表示、Draft のみ編集可）
- `verifyNoPiiLeak` 多層防御チェック
- 課題の追加/編集/削除 UseCase + UI

### 含まない
- ケアプラン集約・ケアプランドラフト生成（計画 04）
- ナレッジ RAG（計画 04）
- モニタリング（MVP スコープ外）
- iOS Safari 対応（要件上 MVP スコープ外）

---

## 3. PR 分割案

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 1 | `[DB]` | migration `004_assessments.sql` | `assessments` + `assessment_issues` DDL + CHECK + RLS + インデックス（`idx_assessments_tenant_conducted DESC`） | `assessment-aggregate-design.md §6.1, §6.2, §6.3` |
| 2 | `[DB]` | migration `005_assessment_drafts.sql` | `assessment_drafts` DDL + RLS（TTL 削除は pg_cron 不使用; リポジトリ読み取り時に `created_at + 30min < now()` を検証して NOT_FOUND を返す方式に変更） | `pii-masking-design.md §6.1, §6.3` |
| 3 | `[DB]` | migration `006_save_assessment_rpc.sql` | `save_assessment` RPC（楽観的ロック検証 + version + 1、子の全削除→再挿入、子 ID 永続性契約） | `assessment-aggregate-design.md §7.4` |
| 4 | `[Domain]` | `AssessmentIssue` + `PlaceholderMapSnapshot` | 子エンティティ（create / reconstruct / update メソッド）、`PlaceholderMapSnapshot`（`unmask(text)` / `count` / `toJSON`） | `assessment-aggregate-design.md §3.2, §3.3` |
| 5 | `[Domain]` | `Assessment` 集約ルート | `AssessmentType` / `AssessmentStatus` / `IssueCategory` / `IssuePriority` 型、ファクトリ + 不変条件 + 状態遷移（`finalize()`）+ `addIssue` / `removeIssue` / `updateIssue`（コールバック方式）+ `getUnmaskedSummary` / `getUnmaskedIssueDescription` | `assessment-aggregate-design.md §3.1, §3.4, §4, §5` |
| 6 | `[Infra]` | `SupabaseAssessmentRepository` + `AssessmentMapper` | 親子テーブル並列取得、子 ID ペイロード同梱（永続性契約）、`findLatestFinalizedByRecipient`、楽観的ロック例外変換 | `assessment-aggregate-design.md §7.3` |
| 7 | `[Infra]` | `SupabaseAssessmentDraftRepository` | `saveTemporary`（30 分後 TTL）、`findById`（TTL 失効チェック込み）、`delete`、テナント越境ガード | `pii-masking-design.md §5.2` |
| 8 | `[UI]` | 音声入力コンポーネント | Web Speech API ラッパ、録音開始 / 停止、確定文字列の表示、精度不足時の手動編集テキストエリア、ブラウザ未対応時の直接入力フォールバック | 要件 §4.2、`care-manager-ai-design.md §3.1`（音声の扱い） |
| 9 | `[App]` | `PrepareAssessmentDraftUseCase` + Server Action | `buildKnownPiiSetForTenant` 呼出 → `IPiiMaskingService.mask` → `assessment_drafts` に一時保存、`draftId` 返却、エイリアス生成（`田中太郎さん` / `田中さん` / `太郎さん`） | `pii-masking-design.md §5.2` |
| 10 | `[UI]` | マスキングプレビュー画面 | `/assessments/new/preview/[draftId]` ルート、左: 原文・右: マスク後の 2 ペイン、プレースホルダ一覧（カテゴリ別）、手動追加マスクボタン、「この内容で AI 要約」ボタン | `pii-masking-design.md §2.3`（フロー図）、`pii-masking-design.md §9.4` |
| 11 | `[App]` | `GenerateAssessmentFromMaskedTextUseCase` + `verifyNoPiiLeak` | ドラフト取得 → `approvedMaskedText` を `verifyNoPiiLeak` で再検査 → `IAiSummarizationService.summarizeAsAssessment` → `Assessment.create` → 永続化 → `IAiGenerationLogRepository.save`（`kind='assessment_summarization'`、`related_entity_id`）→ ドラフト削除 | `pii-masking-design.md §5.3` / `assessment-aggregate-design.md §8.1` |
| 12 | `[UI]` | アセスメント一覧画面 | `/assessments` および `/care-recipients/[id]/assessments`、利用者別 + 全体一覧、最新実施日順、ステータスバッジ | `assessment-aggregate-design.md §10` |
| 13 | `[App+UI]` | `GetAssessmentForViewUseCase` + 詳細画面 | 集約経由でアンマスク（`getUnmaskedSummary` / `getUnmaskedIssueDescription`）、`AssessmentViewDto` 変換、Draft のみ編集可の UI ガード | `assessment-aggregate-design.md §8.2` / `pii-masking-design.md §7` |
| 14 | `[App+UI]` | 課題編集ユースケース + UI | `AddAssessmentIssueUseCase` / `UpdateAssessmentIssueUseCase` / `RemoveAssessmentIssueUseCase`、インラインまたはモーダル編集、最後の 1 件は削除不可のバリデーション表示 | `assessment-aggregate-design.md §3.4` |
| 15 | `[App+UI]` | `FinalizeAssessmentUseCase` + 確定ボタン | 確認モーダル + 状態遷移、確定後は編集 UI をロック、楽観的ロック競合時のメッセージ表示 | `assessment-aggregate-design.md §8.3` |
| 16 | `[Test]` | 統合・セキュリティテスト | `verifyNoPiiLeak` がマスク漏れを検出することの確認、TTL 失効後に AI 送信ができないこと、RLS で別テナントのアセスメントが見えないこと、アンマスク往復の等価性 | `pii-masking-design.md §8.3` / `assessment-aggregate-design.md §9` |

**PR サイズ目安**: PR 10（マスキングプレビュー）は UI 量が多いため、差分ハイライト機能を別 PR に分離することを検討。PR 5（Assessment ルート）も大きい場合は「ファクトリ + 不変条件」と「状態遷移 + アンマスク」で分割可。

---

## 4. 手動検証手順

前提: 計画 01・02 完了、利用者が 1 名以上登録済み、Gemini API が動作中。

1. 利用者詳細画面から「アセスメント新規作成」→ 音声入力コンポーネント表示
2. マイクで「田中太郎さん、090-1234-5678、膝の痛みを訴えており歩行に介助が必要」と発話 → 文字起こし表示
3. 「マスキング確認へ」ボタン → プレビュー画面
4. 左ペイン: 原文 / 右ペイン: `{RECIPIENT_NAME_001} さん、{PHONE_001}、膝の痛みを訴えており歩行に介助が必要` のような表示
5. 「この内容で AI 要約」クリック → 数秒後、課題一覧（category/description/priority）が表示される
6. 画面では **アンマスク状態**（`田中太郎 さん、090-1234-5678、...`）で表示されることを確認
7. 課題を 1 件追加・1 件編集 → 保存
8. 「アセスメント確定」クリック → 確認モーダル → 確定 → ステータス `Finalized` に遷移、編集 UI が無効化
9. Supabase Dashboard で確認:
   - `assessments.source_transcript` に原文が残っている
   - `assessments.masked_summary` にマスク済みテキスト
   - `ai_generation_logs` に `kind='assessment_summarization'` の行、`original_text` は NULL（単一ソースは集約）
   - `assessment_drafts` から該当 `draftId` の行が削除されている
10. 別タブで同じアセスメントを開き、片方で編集中にもう片方で編集保存 → 楽観的ロック例外（`CONFLICT`）が画面に表示される
11. 30 分以上放置したドラフトで「この内容で AI 要約」→ `NOT_FOUND` エラー（TTL 失効）
12. マスク後テキストを手で編集して `090-9999-9999` を入れる → AI 要約実行 → `verifyNoPiiLeak` が検出してエラー

---

## 5. 参照設計書

- `assessment-aggregate-design.md §3-§8`（本計画の主参照。集約・不変条件・状態遷移・DDL・リポジトリ・ユースケース接続）
- `pii-masking-design.md §5`（2 段階ユースケース分割の本命）
- `pii-masking-design.md §6.1, §6.3`（`assessment_drafts` + TTL）
- `pii-masking-design.md §7`（アンマスキング方針）
- `ai-support-context-design.md §3.3, §4.2, §6`（アセスメント要約プロンプト・スキーマ・サービス）
- `care-manager-ai-design.md §7.4.1`（2 段階分割の設計判断）

---

## 6. 完了基準

- [ ] 全 PR がマージされ、CI がグリーン
- [ ] 手動検証手順 1〜12 が全て通る
- [ ] TTL チェックが `SupabaseAssessmentDraftRepository.findById` 内に実装され、作成から 30 分超過の行は `NOT_FOUND` を返す（pg_cron 不使用; DB 行の物理削除は運用フェーズで再検討）
- [ ] `verifyNoPiiLeak` が正規表現パターンと既知 PII の両方でマスク漏れを検出できる
- [ ] `Assessment` 集約の単体テストが主要パス（create / finalize / addIssue / removeIssue / アンマスク）を網羅
- [ ] アセスメント確定後の編集不可が UI / ユースケース / ドメインの 3 層で守られている
- [ ] 計画 04 で参照できる「Finalized アセスメント」が取得可能（`findLatestFinalizedByRecipient` が動く）
