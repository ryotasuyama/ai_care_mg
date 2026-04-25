# 実装計画 04: ナレッジ RAG + ケアプラン集約（本プロジェクト最大フェーズ）

**フェーズ番号**: 4 / 5
**想定 PR 数**: 24 件前後（本計画群中最大）
**依存**: 計画 03 完了（Finalized アセスメント参照が必須）
**後続**: 計画 05（メール返信 + 運用仕上げ）

---

## 1. 目的

ナレッジアップロード → 埋め込み生成 → RAG 検索 → ケアプランドラフト生成 → ケアプラン集約の編集・状態遷移・後継作成、までを通しで動かす。

本計画完了時点のユーザー価値: **要件 §4.3〜§4.4 の中核機能がすべて動作**する。ケアマネは事業所のナレッジを参照しながら AI ドラフト起点でケアプランを作成・運用できる。

---

## 2. スコープ

### 含む
- `pgvector` 拡張 + `knowledge_documents` + `knowledge_chunks` + HNSW インデックス + `can_access_knowledge` RLS 関数 + `search_knowledge` RPC
- Knowledge ドメイン（`KnowledgeDocument` + `KnowledgeChunk` + 値オブジェクト群）+ CQRS の Read Model（`KnowledgeSearchView`）
- Supabase Storage ラッパ + アップロード / 削除 / オーファン掃除
- テキスト抽出（PDF / DOCX / TXT）+ チャンク分割
- Vercel Cron による埋め込み生成（`/api/cron/process-knowledge`）+ スタックジョブ救済
- 日次オーファン掃除 Cron
- `care_plans` + 子 3 テーブル + `save_care_plan` / `create_successor_care_plan` RPC
- `CarePlan` 集約（子エンティティ含む）+ 4 状態遷移
- `GenerateCarePlanDraftUseCase`（RAG + 再マスキング）
- `CreateCarePlanFromDraftUseCase` / `UpdateCarePlanUseCase` / 状態遷移ユースケース群
- `CreateSuccessorCarePlanUseCase`（月次見直し）
- 各 UI: ナレッジ管理、ケアプランドラフト生成、ケアプラン編集・確定、後継プラン作成

### 含まない
- メール返信機能（計画 05）
- Sentry / エラー監視（計画 05）
- E2E テスト骨格（計画 05）
- スキャン PDF の OCR 対応（要件上 MVP スコープ外）

---

## 3. PR 分割案

### 3.1 ナレッジ基盤（PR 1-7）

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 1 | `[DB]` | migration `007_pgvector_and_knowledge.sql` | `CREATE EXTENSION vector` + `knowledge_documents` + `knowledge_chunks` DDL + CHECK + `chunk_personal_has_owner` + `updated_at` Trigger + HNSW インデックス | `knowledge-context-design.md §4.1-§4.4` |
| 2 | `[DB]` | migration `008_knowledge_rls.sql` | `can_access_knowledge(tenant_id, scope, owner_id)` 関数 + 両テーブル RLS ポリシー（`FOR ALL`） | `knowledge-context-design.md §5` |
| 3 | `[DB]` | migration `009_search_knowledge_rpc.sql` | `search_knowledge` RPC（`<=>` コサイン距離、`processing_status='ready'` 絞り込み、`SECURITY INVOKER`） | `knowledge-context-design.md §6.1` |
| 4 | `[Domain]` | Knowledge ドメイン | `KnowledgeDocument` 集約（状態遷移 `markAsProcessing` / `markAsReady` / `markAsFailed` / `rename` / `canBeAccessedBy`）、`KnowledgeChunk`、`EmbeddingVector`（768 次元）、`SourceFile`（20MB 上限）、`KnowledgeScope` / `ProcessingStatus` / `SourceFileType` | `knowledge-context-design.md §2.5-§2.10` |
| 5 | `[Domain]` | Knowledge インターフェース | `IKnowledgeDocumentRepository` + `IKnowledgeSearchService` + `KnowledgeSearchView`（Read Model）+ `IKnowledgeStorageService` | `knowledge-context-design.md §2.4` |
| 6 | `[Infra]` | Knowledge リポジトリ・ストレージ実装 | `SupabaseKnowledgeDocumentRepository`（親子取得、save_document RPC 必要なら追加）、`SupabaseKnowledgeStorageService`（Storage アップロード / 削除 / signed URL 発行） | `knowledge-context-design.md §2, §9` |
| 7 | `[Infra]` | `SupabaseKnowledgeSearchService` | `search_knowledge` RPC 呼出、`KnowledgeSearchView[]` への変換、`requesterId` はメタ情報として保持（RLS が実判定） | `knowledge-context-design.md §2.4, §6` |

### 3.2 ナレッジアップロード・処理（PR 8-14）

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 8 | `[App+API+UI]` | `UploadKnowledgeDocumentUseCase` + API Route + UI | ファイルアップロード API Route（Vercel のリクエストサイズ制限対策で Server Action ではなく Route）、scope 選択（admin のみ共有可）、個人ナレッジ選択時は PII 警告バナー + チェックボックス必須、Storage → DB 順で保存 | `knowledge-context-design.md §9.1`、`care-manager-ai-design.md §10.4`（API Route 例外扱い） |
| 9 | `[Infra]` | テキスト抽出 + チャンク分割ユーティリティ | `ITextExtractor` / `ITextChunker` インターフェース、`pdf-parse` or `unpdf` / `mammoth` / UTF-8 txt の分岐実装、スキャン PDF は抽出失敗→`failed` 遷移、800 文字 + 100 オーバーラップ | `knowledge-context-design.md §3, §3.3, §3.4` |
| 10 | `[App]` | `ProcessKnowledgeEmbeddingsUseCase` | `findPendingDocuments(batchSize)` → `markAsProcessing` + 保存 → Storage ダウンロード → 抽出 → 分割 → Gemini Embedding（逐次）→ `markAsReady(chunks)` + 保存、Vercel 60 秒タイムアウト接近時は早期 break、失敗時は `markAsFailed` | `knowledge-context-design.md §8.3` |
| 11 | `[Infra+API]` | Vercel Cron Route `/api/cron/process-knowledge` | `Authorization: Bearer CRON_SECRET` 認証、`service_role` クライアント使用、スタックジョブ救済クエリ（`processing` かつ `updated_at < NOW() - 5 min` を pending に戻す）、`vercel.json` に Cron 設定（毎分） | `knowledge-context-design.md §8.3, §8.4` |
| 12 | `[App+UI]` | `DeleteKnowledgeDocumentUseCase` + UI | ロール制御（共有は admin のみ、個人は所有者のみ）、DB 削除先行 + Storage 削除は best-effort（失敗でも継続）、削除中表示 | `knowledge-context-design.md §9.2, §9.3.1` |
| 13 | `[App+API]` | `CleanupOrphanedStorageUseCase` + 日次 Cron | Storage 全ファイルリスト vs DB の `source_file_path` の差分削除、`/api/cron/cleanup-knowledge-orphans`、`vercel.json` に日次設定 | `knowledge-context-design.md §9.3.2` |
| 14 | `[UI]` | ナレッジ一覧・詳細画面 | `/knowledge` 配下、scope 別表示、`processing_status` ステータスバッジ + 失敗理由表示、アップロード日順ソート、削除ボタン | `knowledge-context-design.md §10.1` |

### 3.3 ケアプラン基盤（PR 15-18）

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 15 | `[DB]` | migration `010_care_plans_and_children.sql` | `care_plans` + `care_plan_long_term_goals` + `care_plan_short_term_goals` + `care_plan_service_items` DDL + CHECK + RLS（`FOR ALL` を子 3 テーブルに） | `care-plan-aggregate-design.md §6` |
| 16 | `[DB]` | migration `011_care_plan_rpcs.sql` | `save_care_plan` RPC（楽観的ロック + 子の全削除→再挿入、子 ID 永続性契約）+ `create_successor_care_plan` RPC（前プラン Archived + 新プラン INSERT 原子化） | `care-plan-aggregate-design.md §7.5, §7.6` |
| 17 | `[Domain]` | CarePlan ドメイン | `CarePlan` 集約ルート、`LongTermGoal` / `ShortTermGoal` / `ServiceItem` 子エンティティ、`PlanPeriod` 値オブジェクト、`CarePlanStatus` 列挙、4 状態遷移（`submitForReview` / `finalize` / `archive`）、`validateGoalRelations` | `care-plan-aggregate-design.md §3-§5` |
| 18 | `[Infra]` | `SupabaseCarePlanRepository` + `CarePlanMapper` | 親子並列取得、子 ID ペイロード同梱（永続性契約）、`findActiveByRecipient(today)`、`saveSuccessor` で `create_successor_care_plan` RPC 呼出、楽観的ロック例外変換 | `care-plan-aggregate-design.md §7.3, §7.4` |

### 3.4 ケアプランドラフト生成と編集（PR 19-24）

| # | 種別 | タイトル | 主な実装項目 | 参照設計書 |
|---|---|---|---|---|
| 19 | `[App]` | `GenerateCarePlanDraftUseCase`（RAG + 再マスキング） | Finalized アセスメント取得 + 利用者取得 → `searchByText`（課題をクエリに） → **RAG 結果を `IPiiMaskingService.mask` で再マスキング**（共有 scope は最適化余地として別 PR）→ `ICarePlanGenerationService.generateDraft` → `ai_generation_logs` 記録（`kind='care_plan_draft'`、`related_entity_id=assessment.id`）→ 引用情報付きで返却 | `care-manager-ai-design.md §7.7` / `knowledge-context-design.md §7.3` |
| 20 | `[UI]` | ケアプランドラフト生成画面 | `/care-plans/draft/[assessmentId]`、アセスメント概要表示、「ドラフト生成」ボタン、生成中プログレス、結果表示（長期目標 / 短期目標 / サービス候補 / 引用ナレッジ）、「採用」or「破棄」ボタン | `care-manager-ai-design.md §7.7` |
| 21 | `[App]` | `CreateCarePlanFromDraftUseCase` | 採用時に `CarePlan.create`（Draft 状態）+ `ICarePlanRepository.save`、計画期間（`PlanPeriod`）は UI から入力、番号は自動採番 or 入力 | `care-plan-aggregate-design.md §8.1` |
| 22 | `[App+UI]` | `UpdateCarePlanUseCase` + 編集画面 | 長期目標・短期目標・サービス内容の追加/編集/削除、親子リレーション維持（短期目標の `parentLongTermGoalId`）、楽観的ロック UI、一括保存 | `care-plan-aggregate-design.md §3, §8` |
| 23 | `[App+UI]` | 状態遷移ユースケース + UI | `FinalizeCarePlanUseCase` / `ArchiveCarePlanUseCase`（InReview は不要と決定し 3 状態に縮退: Draft → Finalized → Archived）、各ボタン、確定時のサービス内容必須チェックのエラー表示、状態バッジ | `care-plan-aggregate-design.md §5, §8.2` |
| 24 | `[App+UI]` | `CreateSuccessorCarePlanUseCase` + 後継プラン UI | 「次期プラン作成」ボタン（Finalized プランのみ）、前プランの内容をコピーして新計画期間で Draft 作成、前プラン自動 Archive、`saveSuccessor` 経由の原子保存、計画期間重複チェック | `care-plan-aggregate-design.md §8.4, §8.5` |

**PR サイズ目安**:
- PR 4（Knowledge ドメイン）と PR 17（CarePlan ドメイン）は大きいため、子エンティティ・値オブジェクトを別 PR に分離することを推奨
- PR 10（`ProcessKnowledgeEmbeddingsUseCase`）は処理量が多いため、テキスト抽出・埋め込み・保存を個別 PR にする選択肢あり
- PR 22（編集画面）は UI 量最大のため、長期目標編集 / 短期目標編集 / サービス内容編集で 3 分割も可

---

## 4. 手動検証手順

前提: 計画 01〜03 完了、Finalized アセスメントが 1 件以上存在。

### ナレッジフロー
1. 管理者アカウントで `/knowledge` → 共有ナレッジとして厚労省 PDF 1 件（10MB 程度）をアップロード
2. ステータスが `pending` → 1 分以内に `processing` → さらに 1〜2 分で `ready` に遷移
3. Supabase Dashboard で `knowledge_chunks` を見て、適切な件数のチャンクが作られていること、`embedding` が 768 次元の配列であること
4. ケアマネアカウントでログインし直し、同じ共有ナレッジが閲覧可能 / 個人ナレッジは作成者以外には不可視
5. スキャン PDF（画像ベース）をアップロード → `failed` 状態になり `processing_error` に理由が表示される
6. ナレッジを 1 件削除 → DB から即消え、Storage からも消える（1 分以内、best-effort）
7. わざと Storage に直接ファイルを置いて 24 時間後、オーファン掃除 Cron で削除されることを確認

### ケアプランフロー
8. `/care-recipients/[id]/assessments` で Finalized アセスメントを開き「ケアプランドラフト作成」クリック
9. RAG 引用付きでドラフトが表示される（10〜30 秒）。引用元ナレッジのタイトル・ページ番号が付いている
10. 「採用」→ 計画期間を入力（2026-05-01〜2026-10-31）→ Draft 保存
11. 編集画面で短期目標を 1 件追加、サービス内容を 2 件追加 → 保存
12. 「確定」→ サービス内容チェックが通れば `Finalized` に遷移、`finalized_at` が入る
14. 利用者詳細画面で「現時点で有効なケアプラン」として今のプランが表示される（`findActiveByRecipient`）
15. 翌月「次期プラン作成」→ 新計画期間 2026-11-01〜2027-04-30 で Draft 作成 → 前プランが自動で `Archived`
16. Supabase Dashboard で確認:
    - `care_plans` に前プランと新プランの 2 行、version が正しく加算
    - `ai_generation_logs` に `kind='care_plan_draft'` の行、`related_entity_id=assessment.id`
    - 楽観的ロック: 別タブで同じケアプランを編集 → 片方保存後にもう片方保存で `CONFLICT`
17. 別テナントでログインし、上記ナレッジ・ケアプランが見えないこと（RLS）

---

## 5. 参照設計書

### ナレッジ
- `knowledge-context-design.md §2`（ドメイン）
- `knowledge-context-design.md §3`（チャンク分割）
- `knowledge-context-design.md §4`（DB）
- `knowledge-context-design.md §5`（RLS）
- `knowledge-context-design.md §6`（ベクトル検索 RPC）
- `knowledge-context-design.md §7`（PII との整合）
- `knowledge-context-design.md §8`（バックグラウンド処理）
- `knowledge-context-design.md §9`（ユースケース）

### ケアプラン
- `care-plan-aggregate-design.md §2-§5`（集約・ドメイン・不変条件・状態遷移）
- `care-plan-aggregate-design.md §6`（DB）
- `care-plan-aggregate-design.md §7`（リポジトリ・RPC）
- `care-plan-aggregate-design.md §8`（ユースケース接続・バージョニング）

### 統合
- `care-manager-ai-design.md §7.7`（`GenerateCarePlanDraftUseCase` 全体像と RAG 再マスキング）
- `ai-support-context-design.md §3.4, §4.3, §6`（ケアプランプロンプト・スキーマ・サービス）

---

## 6. 完了基準

- [ ] 全 PR がマージされ、CI がグリーン
- [ ] 手動検証手順 1〜17 が全て通る
- [ ] Vercel Cron が本番環境で毎分動作（Vercel ダッシュボードのログで確認）
- [ ] ケアプランドラフト生成が **30 秒以内**（p50）、60 秒以内（p95）
- [ ] `save_care_plan` / `create_successor_care_plan` の楽観的ロックが想定通り動く（Jest 統合テスト）
- [ ] HNSW インデックスが使われていること（`EXPLAIN ANALYZE` で確認）
- [ ] ケアプラン 4 状態遷移が UI / ユースケース / ドメイン / DB CHECK 制約の 4 層で守られている
- [ ] CarePlan は **3 状態（Draft → Finalized → Archived）** で実装。DB CHECK 制約も `('draft','finalized','archived')` の 3 値とする（決定済み）
