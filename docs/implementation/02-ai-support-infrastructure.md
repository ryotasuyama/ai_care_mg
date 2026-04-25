# 実装計画 02: AI 支援コンテキストのインフラ一式

**フェーズ番号**: 2 / 5
**想定 PR 数**: 16 件前後
**依存**: 計画 01 完了（DI コンテナ・認証基盤）
**後続**: 計画 03（アセスメント統合）・計画 04（ケアプラン / RAG）・計画 05（メール返信）

---

## 1. 目的

Gemini 呼び出し、PII マスキング、AI 生成ログ永続化の**インフラ一式**を完成させる。以降のフェーズでユースケース層から「要約する」「ドラフト生成する」「返信を作る」「埋め込む」が即座に呼び出せる状態にする。

本計画完了時点のユーザー価値: 画面上は見えないが、開発用 Server Action から各サービスを叩けば Gemini が応答し `ai_generation_logs` に記録される。**機能というより土台整備**のフェーズ。

---

## 2. スコープ

### 含む
- `GeminiClient`（HTTP + リトライ + トークン集計 + レイテンシ測定）
- プロンプトテンプレート 3 種類（`prompts/v1/`）+ 共通契約型
- Zod レスポンススキーマ 3 種類（`schemas/`）+ `zodToJsonSchema` での JSON Schema 生成
- 高レイヤサービス 4 種（`GeminiAiSummarizationService` / `GeminiCarePlanGenerationService` / `GeminiEmailReplyDraftService` / `GeminiEmbeddingService`）
- ドメインインターフェース 4 種（上記サービスに対応）
- `ai_generation_logs` テーブル + リポジトリ
- `IPiiMaskingService` + `StructuredPiiMaskingService` + MVP 正規表現パターン
- DI コンテナへの登録
- ユニットテスト（マスキングパターン網羅・Gemini モック往復）

### 含まない
- 各サービスの実際の業務ユースケース呼び出し（計画 03〜05 で実施）
- Web Speech API / 音声入力 UI（計画 03）
- マスキングプレビュー UI（計画 03）
- `IAiGenerationLogRepository` を使う具体ユースケース（計画 03 以降）

---

## 3. PR 分割案

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 1 | `[Infra]` | `GeminiClient`（低レイヤ） | REST 呼出ラッパ、API キーの env 取得、5xx / 429 リトライ（指数バックオフ 500ms→2000ms）、4xx 即失敗、ネットワークタイムアウト再試行 1 回、`requestTokens` / `responseTokens` / `latencyMs` 返却 | `ai-support-context-design.md §5` |
| 2 | `[Infra]` | プロンプト共通契約 | `prompts/v1/types.ts` に `PromptTemplate<TVars>` 契約、`shared.ts` で共通プリアンブル定義 | `ai-support-context-design.md §3.1, §3.2` |
| 3 | `[Infra]` | プロンプト: アセスメント要約 + スキーマ | `prompts/v1/assessment-summarization.ts` + `schemas/assessment-summarization.ts`（Zod → JSON Schema 変換、`IssueCategorySchema` / `IssuePrioritySchema` / レスポンス本体） | `ai-support-context-design.md §3.3, §4.2` |
| 4 | `[Infra]` | プロンプト: ケアプランドラフト + スキーマ | `prompts/v1/care-plan-draft.ts` + `schemas/care-plan-draft.ts`（長期目標 / 短期目標 / サービス候補 / citations の Zod 定義） | `ai-support-context-design.md §3.4, §4.3` |
| 5 | `[Infra]` | プロンプト: メール返信 + スキーマ | `prompts/v1/email-reply-draft.ts` + `schemas/email-reply-draft.ts`（subject / body 最小スキーマ） | `ai-support-context-design.md §3.5, §4.4` |
| 6 | `[Domain]` | AI 支援ドメインインターフェース | `IAiSummarizationService` / `ICarePlanGenerationService` / `IEmailReplyDraftService` / `IEmbeddingService` を `domain/ai-support/` 配下に定義、各 I/O 型を公開 | `ai-support-context-design.md §6.1` |
| 7 | `[Infra]` | `GeminiAiSummarizationService` | プロンプト組立 + `GeminiClient.generateJson` 呼出 + Zod `safeParse`、パース失敗時は最大 2 回リトライ、`promptTemplateId` / `tokenUsage` の返却 | `ai-support-context-design.md §4.5, §6.2` |
| 8 | `[Infra]` | `GeminiCarePlanGenerationService` | 同上、`knowledgeSnippets` 配列を受け取りプロンプトに埋める | `ai-support-context-design.md §6.2` |
| 9 | `[Infra]` | `GeminiEmailReplyDraftService` | 同上、subject / body を組み立てた `draftReply` を返す | `ai-support-context-design.md §6` |
| 10 | `[Infra]` | `GeminiEmbeddingService` | `GeminiClient.embed` 呼出、`EmbeddingVector.create(768)` 生成 | `ai-support-context-design.md §6, §8.2` |
| 11 | `[DB]` | migration `003_ai_generation_logs.sql` | `ai_generation_logs` DDL（`original_text` NULLABLE、`placeholder_map` JSONB、`prompt_template_id`、`request_tokens` / `latency_ms`）+ インデックス + RLS | `pii-masking-design.md §6.2` / `ai-support-context-design.md §7` |
| 12 | `[Domain+Infra]` | `IAiGenerationLogRepository` + 実装 | `IAiGenerationLogRepository` を `domain/ai-support/` に定義、`SupabaseAiGenerationLogRepository` を infra に実装、`AiGenerationLogRecord` の型整備（`placeholderMap.originalValue` はオプショナル） | `ai-support-context-design.md §7` |
| 13 | `[Domain]` | PII マスキングドメイン | `PiiPlaceholder` / `MaskingResult` / `KnownPiiSet` / `IPiiMaskingService` / `PiiCategory` 型を `domain/ai-support/masking/` に定義、`MaskingResult.unmask` / `statistics` メソッド含む | `pii-masking-design.md §3` |
| 14 | `[Infra]` | `StructuredPiiMaskingService` + 正規表現パターン | `MVP_REGEX_PATTERNS` 定義（電話 / メール / 郵便番号 / 西暦生年月日 / 和暦生年月日）、`replaceKnownPiis`（長さ降順置換）・`replaceRegexPatterns` の実装、プレースホルダ衝突回避 | `pii-masking-design.md §4, §4.4` |
| 15 | `[Test]` | ユニットテスト | `StructuredPiiMaskingService` のパターン網羅テスト、`MaskingResult.unmask` の往復テスト、各 `Gemini*Service` の Zod パース成功/失敗テスト（モック `GeminiClient`） | `pii-masking-design.md §8` / `ai-support-context-design.md §9` |
| 16 | `[Infra]` | DI コンテナへのサービス登録 | 計画 01 で作った `container.ts` に全サービスを注入、`process.env.GEMINI_API_KEY` 読込、環境変数未設定時のエラー表示 | `care-manager-ai-design.md §8` |

**PR サイズ目安**: プロンプト + スキーマのペアは 1 PR で問題なし（プロンプト文字列はやや長いが）。`StructuredPiiMaskingService`（PR 14）は実装量多めのため、パターン追加テストを PR 15 に分離することを推奨。

---

## 4. 手動検証手順

前提: `GEMINI_API_KEY` を `.env.local` に設定済み。Supabase に migration 003 適用済み。

1. 開発用の一時 Server Action（`/dev-ai-smoke/actions.ts` など）を作成し、以下を 1 つずつ呼び出す:
   - `summarizeAsAssessment({ maskedText: '利用者は膝の痛みを訴えている。...' })`
   - `carePlanGeneration.generateDraft({ assessmentMaskedSummary: '...', ... })`
   - `emailReplyService.draft({ maskedIncomingEmail: '...', intent: '丁寧に断る' })`
   - `embeddingService.embed('テスト文書')`
2. それぞれの応答が Zod でパースされ、JSON として戻ることを画面に表示
3. Supabase Dashboard で `ai_generation_logs` テーブルを開き、各呼出に対応する行が `kind` / `prompt_template_id` / `request_tokens` 含めて記録されていることを確認
4. `StructuredPiiMaskingService.mask('090-1234-5678 に連絡', { recipientName: '田中太郎' })` を Jest で実行し、`090-1234-5678` が置換されていることを確認
5. 開発用 Server Action は PR 16 マージ後に削除（計画 03 以降で実使用するため）

**注**: 一時 Server Action は `/app/dev/` 配下に置き、`NODE_ENV !== 'production'` でガードすること。本番には含めない。

---

## 5. 参照設計書

- `ai-support-context-design.md §1-§9`（本計画の主たる参照。特に §2 レイヤ構造、§3 プロンプト、§4 Zod、§5 GeminiClient、§6 高レイヤサービス、§7 AI ログ、§8 モデル選定）
- `pii-masking-design.md §3`（PII マスキングドメイン）
- `pii-masking-design.md §4`（正規表現パターン）
- `pii-masking-design.md §6.2`（`ai_generation_logs` DDL）
- `care-manager-ai-design.md §8`（ディレクトリ構成の `infrastructure/ai/` 配下）

---

## 6. 完了基準

- [ ] 全 PR がマージされ、CI がグリーン
- [ ] 手動検証手順 1〜5 が全て通る
- [ ] DI コンテナから `IAiSummarizationService` 等 4 つの interface がすべて取得でき、正常動作する
- [ ] `StructuredPiiMaskingService` の Jest テストが通り、MVP 正規表現パターン 5 種類が全て検出可能
- [ ] `ai_generation_logs` に `request_tokens` / `response_tokens` / `latency_ms` / `prompt_template_id` が欠損なく保存される
- [ ] 開発用 Server Action を削除し、`/app/dev/` 配下に何も残っていない
