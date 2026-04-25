# ケアマネAI支援アプリ 設計ドキュメント

> 本ドキュメントは MVP 開発に向けた設計の現時点でのスナップショット。
> 要件定義書（`ai_care_mg.md`）を前提とし、DDD の方針に沿って設計判断と理由を記録する。
> **本ドキュメントは「全体設計ハブ」として、境界づけられたコンテキスト・コンテキスト間連携・テナント認証・利用者集約・共通ユースケース原則・コミュニケーション支援・Next.js 結合層の設計を担う。ケアプラン集約・アセスメント集約・ナレッジ RAG・PII マスキング・AI 支援（プロンプト/Gemini 呼び出し）は専用ドキュメントに分離済み。**

**ドキュメントバージョン**: 0.4（集約分離・AI 支援コンテキスト分離反映版）
**最終更新**: 2026-04-24

### ドキュメントマップ

**設計書（What / Why）**

| ファイル | 役割 |
|---|---|
| `ai_care_mg.md` | 要件定義書 |
| 本ドキュメント | 全体設計（コンテキスト・利用者集約・共通原則・Next.js 結合） |
| `care-plan-aggregate-design.md` | ケアプラン集約詳細（§4-§5, §6.2-§6.6, §7.3, §7.4.2, §7.9 相当） |
| `assessment-aggregate-design.md` | アセスメント集約詳細 |
| `knowledge-context-design.md` | ナレッジコンテキスト（pgvector RAG） |
| `pii-masking-design.md` | AI 支援コンテキスト: PII マスキング |
| `ai-support-context-design.md` | AI 支援コンテキスト: プロンプト・Gemini クライアント・AI 生成ログ・モデル選定 |

**実装計画書（How / When）** — `docs/implementation/` 配下、PR 粒度の工程表。設計書の内容は重複させず参照のみ。

| ファイル | 対象フェーズ | 想定 PR 数 |
|---|---|---|
| `implementation/01-foundation-and-care-recipient.md` | 基盤 + 認証・テナント + 利用者 | ~15 |
| `implementation/02-ai-support-infrastructure.md` | AI 支援インフラ（Gemini + プロンプト + マスキング） | ~16 |
| `implementation/03-assessment-with-masking.md` | アセスメント集約 + PII 2 段階統合 | ~15 |
| `implementation/04-knowledge-and-care-plan.md` | ナレッジ RAG + ケアプラン集約（最大フェーズ） | ~24 |
| `implementation/05-communication-and-ops.md` | メール返信 + 運用仕上げ（MVP リリース） | ~7 |

---

## 1. ドキュメントの目的と位置づけ

### 1.1 目的

- ケアマネジャー向け AI 支援 Web アプリの **MVP 開発における設計判断を記録** する
- 各設計判断の **「なぜそうするか」** を明示し、将来の見直し時の判断材料を残す
- MVP から SaaS 化（マルチテナント化）への移行を見据えた構造を担保する

### 1.2 想定読者

- 本プロジェクトの開発者（現状はフリーランス1名）
- 将来チームに参加する開発者
- 設計レビューを行う第三者

### 1.3 スコープ

本ドキュメントが対象とするのは以下：

- 境界づけられたコンテキストの分割方針とコンテキスト間通信
- 利用者集約の設計
- マルチテナント・認証の基本方針（`tenants` / `app_users` DDL、Supabase Auth 連携）
- 共通のユースケース原則・エラーハンドリング・Next.js 結合層（Server Action / RSC / API Route）
- コミュニケーション支援ユースケース（メール返信）
- ケアプランドラフト生成ユースケース（RAG 連携の結節点）

以下は本ドキュメントのスコープ外（各専用ドキュメントで扱う）:

- ケアプラン集約の詳細 → `care-plan-aggregate-design.md`
- アセスメント集約の詳細 → `assessment-aggregate-design.md`
- ナレッジ RAG の詳細 → `knowledge-context-design.md`
- PII マスキング戦略 → `pii-masking-design.md`
- AI 支援コンテキスト詳細（プロンプト・Gemini クライアント・AI ログ） → `ai-support-context-design.md`
- フロントエンド UI 設計・インフラ構成

---

## 2. 設計の全体方針

### 2.1 DDD 適用方針

| 方針 | 内容 |
|------|------|
| ユビキタス言語 | 介護業界の用語（利用者・ケアプラン・アセスメント・モニタリング等）をコード・スキーマ・ドキュメントで一貫して使う |
| ドメイン層の独立性 | ドメイン層は Next.js / Supabase / Gemini SDK に一切依存しない純粋な TypeScript |
| 集約境界 | トランザクション整合性が必要な範囲を集約とし、それ以外は ID 参照で疎結合にする |
| 不変条件の保護 | 集約ルート経由でのみ集約内部を変更できるようにし、不変条件を常に守る |

### 2.2 MVP 優先方針

| 方針 | 内容 |
|------|------|
| 実装容易性 | 厳密な DDD 原則と実装工数のバランスを取り、MVP では一部妥協する |
| 可用性 | Vercel + Supabase のマネージドサービスに依存し、自前運用負担を最小化 |
| 拡張余地 | 妥協する場合も、後から拡張できる構造を選ぶ（特にマルチテナントは初期から組み込む） |
| 過剰設計の回避 | DDD パターンを「とりあえず全部入れる」のではなく、業務的価値があるものだけ採用する |

### 2.3 妥協してよい点・妥協してはいけない点

**妥協してよい点（MVP）**
- 一部のエンティティは値オブジェクト化せずプリミティブで扱う
- 状態遷移は最小限に絞る
- 監査ログは `created_by` / `updated_at` のみで開始
- AI 生成ドラフトはドメインモデル化せず「ログ」として扱う

**妥協してはいけない点**
- すべてのテーブルに `tenant_id` を持たせる（後付けは破壊的変更になる）
- ドメイン層のフレームワーク非依存
- 集約ルート経由でのみ更新する原則
- RLS によるテナント分離

---

## 3. 境界づけられたコンテキスト

### 3.1 コンテキストマップ

要件から、以下の 5 つの境界づけられたコンテキストを識別する。

| # | コンテキスト | 責務 | 主な集約 | 詳細ドキュメント |
|---|------|------|---------|----------------|
| 1 | **ケアマネジメント** | 利用者・ケアプラン・アセスメントの中核業務 | 利用者、ケアプラン、アセスメント | `care-plan-aggregate-design.md`, `assessment-aggregate-design.md`, 本ドキュメント §4 |
| 2 | **ナレッジ** | 個人・共有ナレッジの管理と RAG 検索 | ナレッジドキュメント | `knowledge-context-design.md` |
| 3 | **AI 支援** | Gemini API 呼び出し・PII マスキング・プロンプト管理・AI 生成ログ | (集約なし、サービス層+`ai_generation_logs`) | `pii-masking-design.md`, `ai-support-context-design.md` |
| 4 | **テナント・認証** | 事業所・ユーザー・ロール管理 | 事業所、ユーザー | 本ドキュメント §5.1.1, §10.5 |
| 5 | **コミュニケーション支援** | メール返信ドラフト生成（貼付・生成・コピーのみ、送信しない） | (集約なし、サービス層のみ) | 本ドキュメント §7.6 |

**音声記録について**: 要件定義書 §4.2 の音声入力機能は独立コンテキストにせず、**ケアマネジメントコンテキスト内のアセスメント集約の生成入力として扱う**（`sourceTranscript`）。理由: 音声は「アセスメント作成の手段」であり、単独で業務的な意味を持たないため。文字起こしはクライアントで完結し、サーバー側には既に文字起こし済みテキストが渡る。

**コミュニケーション支援コンテキストについて**: 要件定義書 §4.5 のメール返信機能。集約化しない理由: 業務ロジック（不変条件・状態遷移）がなく、「入力を Gemini に渡して出力をそのまま返す」だけの変換処理。AI 支援コンテキストのユースケースとして扱い、監査ログのみ `ai_generation_logs` に `kind='email_reply_draft'` で残す（詳細は §7.6）。将来「送信履歴管理」などが必要になったら集約に昇格させる。

### 3.2 コンテキスト分割の理由

**理由1：変更の軸が違う**

- ケアマネジメントは「介護保険制度の改正」で変更される
- AI 支援は「Gemini API 仕様変更・マスキング要件追加」で変更される
- 音声記録は「Web Speech API / Gemini Audio 入力の挙動」で変更される

変更理由が違うものは境界を分けるのが DDD の基本。

**理由2：ユビキタス言語の衝突を防ぐ**

「ドラフト」という言葉は、ケアマネジメント文脈では「ケアプランの原案」だが、AI 支援文脈では「LLM の生成結果」を意味する。境界を分けることで同じ言葉が異なる意味を持つことを許容できる。

**理由3：SaaS 化への備え**

テナント・認証コンテキストを独立させることで、後から組織階層の複雑化（法人 → 事業所 → ユーザー）に対応しやすくなる。

### 3.3 コンテキスト間の通信

MVP では **同一 Node.js プロセス内の直接呼び出し** とする。ただし以下を守る:

| ルール | 内容 |
|--------|------|
| インターフェース経由の依存 | 呼び出し側のドメイン層には抽象（インターフェース）のみを置き、実装は `infrastructure/` 配下から DI で注入する |
| 下流から上流への依存禁止 | AI 支援・ナレッジ・テナント認証コンテキストは、ケアマネジメントコンテキストの具象モデルを import しない |
| 共有カーネルは `TenantId` / `UserId` のみ | 複数コンテキストで共有される型は `domain/shared/` 配下に限定し、肥大化を防ぐ |
| 非同期境界はイベントではなくユースケース呼び出し | MVP はドメインイベントを導入しない（過剰設計）。必要なら将来 Supabase Realtime or pg_notify で実装 |

#### コンテキスト間の参照関係（MVP）

```
[ケアマネジメント]
     │ 依存（インターフェース経由）
     ├───▶ [AI 支援]         IAiSummarizationService       (ai-support-context-design.md §6)
     │                       ICarePlanGenerationService    (ai-support-context-design.md §6)
     │                       IEmbeddingService             (ai-support-context-design.md §6)
     │                       IPiiMaskingService            (pii-masking-design.md §3.3)
     ├───▶ [ナレッジ]         IKnowledgeSearchService       (knowledge-context-design.md §2.4)
     └───▶ [テナント・認証]    AuthorizationContext（値のみ受け取る、§7.2）

[コミュニケーション支援]
     ├───▶ [AI 支援]         IEmailReplyDraftService       (ai-support-context-design.md §6)
     │                       IPiiMaskingService            (pii-masking-design.md §3.3)
     └───▶ [テナント・認証]    AuthorizationContext

[AI 支援]・[ナレッジ]・[テナント・認証]
     └ 他コンテキストへの依存なし（単方向）
```

これにより、将来マイクロサービス分割が必要になっても、ドメイン層に変更を波及させずにインフラ実装だけ差し替えられる。

---

## 4. 集約のインデックスと利用者集約

### 4.1 ケアマネジメントコンテキスト内の集約

ケアマネジメントコンテキスト内に以下 3 つの集約を置く（+ 集約を持たない AI 生成ログ）。

```
┌─────────────────────────┐
│ 【集約1】利用者          │  ← 本ドキュメント §4.3
│  Root: CareRecipient    │
│  - 基本情報             │
│  - 現在の要介護度       │
└─────────────────────────┘
         ▲ ID参照
         │
┌─────────────────────────┐     ┌──────────────────────────┐
│ 【集約2】ケアプラン      │     │ 【集約3】アセスメント     │
│  Root: CarePlan         │ ──▶ │  Root: Assessment        │
│  → care-plan-aggregate-│ ID  │  → assessment-aggregate-│
│    design.md §2-§5     │ 参照│    design.md §2-§5      │
└─────────────────────────┘     └──────────────────────────┘
         ▲ ID参照
         │
┌─────────────────────────┐
│ 【AI生成ログ】           │
│  ※ ドメインモデルなし   │
│  → ai-support-context-  │
│    design.md §7         │
└─────────────────────────┘
```

### 4.2 集約分割の理由（ケアマネジメントコンテキスト全体）

**なぜ「利用者」と「ケアプラン」を分けるか**
- ライフサイクルが違う: 利用者は一度登録され長く存在し、基本情報の変更は稀。ケアプランは月次で見直され、1 人の利用者が時系列で複数のケアプランを持つ
- 同じ集約にすると、過去のケアプラン履歴を全部読み込まないと利用者を取得できない集約肥大が発生する

**なぜ「アセスメント」を別集約にするか**
- 作成タイミングが違う（訪問ごと、複数ケアプランの基礎になる）
- ケアプラン作成前にアセスメント単独で存在する
- 再利用される（次回見直し時に過去アセスメント参照）

**なぜ「AI 生成ログ」を集約にしないか**
- ドラフトに業務ロジック（不変条件・状態遷移）がほぼない
- ドメインモデル化するとコードが増えるだけで価値が低い
- インフラ層の `ai_generation_logs` テーブルへのリポジトリアクセスのみで扱う
- 後から業務的意味が出てきたら集約に昇格させればよい（DDD の「モデルは進化する」考え方）

ケアプラン集約内部の分割理由（長期目標・短期目標・サービス内容を内包する根拠）は `care-plan-aggregate-design.md §2.3` 参照。

### 4.3 利用者集約の設計

#### 4.3.1 利用者の要介護度の扱い

**方針：最新値のみ集約に保持し、変更履歴は別テーブル**

```
CareRecipient（集約ルート）
  ├ currentCareLevel: CareLevel  ← 最新値のみ
  └ ...

care_level_histories テーブル（集約外、監査ログ）
```

**理由：**
1. 履歴を集約に入れると毎回読み込みが発生し、集約肥大の典型
2. ケアプラン作成時に必要なのは「現時点の要介護度」のみ
3. 履歴は参照・監査用途であり、別の関心事（Query 責務）
4. Supabase トリガーで自動的に履歴記録できる（§5.2）

#### 4.3.2 利用者集約の属性

| 属性 | 型 | 必須 | 備考 |
|------|------|------|------|
| id | CareRecipientId | ✅ | UUID |
| tenantId | TenantId | ✅ | マルチテナント用 |
| fullName | string | ✅ | 氏名（PII） |
| dateOfBirth | Date | ✅ | 生年月日（PII） |
| address | string | ✅ | 住所（PII） |
| phoneNumber | string \| null | ⬜ | 電話番号（PII） |
| currentCareLevel | CareLevel | ✅ | 最新の要介護度のみ。変更履歴は `care_level_histories` テーブル（§5.2） |
| familyMembers | FamilyMember[] | ⬜ | 家族情報（PII）。PIIマスキング用 `KnownPiiSet` 構築に使用 |
| createdBy | UserId | ✅ | 登録ケアマネ |
| createdAt | Date | ✅ | |
| updatedAt | Date | ✅ | |

`FamilyMember` は値オブジェクト: `{ name: string; relation: string; phoneNumber?: string }`

#### 4.3.3 `ageRange` の算出

`GenerateCarePlanDraftUseCase`（§7.7）がケアプランドラフト生成時のプロンプトコンテキストとして `ageRange` を使用する。`dateOfBirth` を直接 AI に渡さないため、集約内でレンジに変換する。

```typescript
get ageRange(): '60代' | '70代' | '80代' | '90代以上' {
  const now = new Date();
  const age = now.getFullYear() - this._dateOfBirth.getFullYear();
  if (age < 70) return '60代';
  if (age < 80) return '70代';
  if (age < 90) return '80代';
  return '90代以上';
}
```

#### 4.3.4 リポジトリインターフェース

```typescript
// domain/care-management/care-recipient/ICareRecipientRepository.ts

export interface ICareRecipientRepository {
  findById(id: CareRecipientId, tenantId: TenantId): Promise<CareRecipient | null>;
  findAll(tenantId: TenantId): Promise<CareRecipient[]>;
  save(careRecipient: CareRecipient): Promise<void>;

  /**
   * テナント内の全利用者から KnownPiiSet を構築。
   * PrepareAssessmentDraftUseCase / DraftEmailReplyUseCase がマスキング前に呼ぶ。
   * 利用者数 < 200 想定のため全件取得で可。スケール懸念は §7.6.2 参照。
   */
  buildKnownPiiSetForTenant(tenantId: TenantId): Promise<KnownPiiSet>;
}
```

---

## 5. データベース設計

### 5.1 スキーマ全体像

```
【マルチテナント基盤】
  tenants                      ← 事業所
  app_users                    ← ユーザー（Supabase Auth と紐付け）

【ケアマネジメント】
  care_recipients              ← 利用者（最新の要介護度を保持）
  care_level_histories         ← 要介護度履歴（トリガーで自動記録、§5.2）
  assessments                  ← アセスメント             (assessment-aggregate-design.md §6)
  assessment_issues            ← 課題・ニーズ             (同上)
  assessment_drafts            ← マスキング一時保存（TTL 30分、pii-masking-design.md §6.1）
  care_plans                   ← ケアプラン               (care-plan-aggregate-design.md §6)
  care_plan_long_term_goals    ← 長期目標                (同上)
  care_plan_short_term_goals   ← 短期目標                (同上)
  care_plan_service_items      ← サービス内容             (同上)

【ナレッジ】                                               (knowledge-context-design.md §4)
  knowledge_documents          ← ナレッジドキュメント（個人/共有）
  knowledge_chunks             ← ベクトル埋め込みチャンク（pgvector）

【AI 支援】                                                (pii-masking-design.md §6.2, ai-support-context-design.md §7)
  ai_generation_logs           ← AI 生成履歴（原文・マスク済・応答・トークン数）
```

各テーブルの詳細 DDL は、本ドキュメントの §5.1.1〜§5.2 と各コンテキストの詳細ドキュメントを参照。

### 5.1.1 テナント・ユーザーテーブル DDL

すべての業務テーブルが `tenants.id` を外部キー参照するため、最初に作成する。

#### tenants

```sql
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### app_users

```sql
CREATE TABLE app_users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  role          VARCHAR(20) NOT NULL DEFAULT 'care_manager',
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT app_users_role_valid
    CHECK (role IN ('care_manager', 'admin'))
);

CREATE INDEX idx_app_users_tenant ON app_users(tenant_id);

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- 同テナントのユーザーを参照可能（自テナントの管理画面等で使用）
CREATE POLICY app_users_tenant_isolation ON app_users
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
```

**設計判断**

| 判断 | 理由 |
|------|------|
| `app_users.id = auth.users.id` | Supabase Auth の UUID をそのまま PK に使う。RLS の `auth.uid()` と直接照合できる |
| `role` は VARCHAR + CHECK 制約 | ENUM より値追加が楽（`ALTER TYPE` 不要） |
| `tenants` テーブルは最小限 | MVP では事業所名のみ。SaaS 化時に住所・プラン情報等を追加 |
| `app_users.email` を持つ | Auth 側のみに持つと JOIN が増える。招待フローでも必要 |

#### Supabase Auth との同期（§10.5 で確定済み）

`auth.users` INSERT 後に `app_users` レコードを自動作成する Database Trigger を使用する。

```sql
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO app_users (id, tenant_id, role, display_name, email)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'tenant_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'role', 'care_manager'),
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();
```

`raw_user_meta_data` には招待時に `tenant_id` と `role` を埋め込む（招待フローは §10.5 参照）。

### 5.1.2 利用者テーブル DDL

```sql
CREATE TABLE care_recipients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),

  -- 基本情報（PII: PIIマスキングの KnownPiiSet 構築に使用）
  full_name           TEXT NOT NULL,
  date_of_birth       DATE NOT NULL,
  address             TEXT NOT NULL,
  phone_number        TEXT,

  -- 家族情報（PII、JSONB で保持）
  -- 構造: [{ "name": "田中花子", "relation": "長女", "phone_number": "090-..." }]
  family_members      JSONB NOT NULL DEFAULT '[]',

  -- 要介護度（最新値のみ。変更履歴は care_level_histories テーブルへ）
  current_care_level  VARCHAR(20) NOT NULL,

  -- 監査
  created_by          UUID NOT NULL REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT care_recipient_care_level_valid
    CHECK (current_care_level IN (
      'support_1', 'support_2',
      'care_1', 'care_2', 'care_3', 'care_4', 'care_5'
    ))
);

CREATE INDEX idx_care_recipients_tenant ON care_recipients(tenant_id);

ALTER TABLE care_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_recipients_tenant_isolation ON care_recipients
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
```

**設計判断**

| 判断 | 理由 |
|------|------|
| `family_members` を JSONB で保持 | 家族数・関係は利用者ごとに異なる。MVP では別テーブル化せず JSONB が現実解 |
| `full_name` 等の PII をそのまま保存 | サーバー側の暗号化は MVP スコープ外。RLS + HTTPS で保護。外部 API 送信前にマスキングで対応 |

### 5.2 要介護度履歴テーブル DDL

§4.3.1 の方針「最新値は集約に保持、履歴は別テーブル」に従う。

```sql
CREATE TABLE care_level_histories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  care_recipient_id   UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,

  -- 変更前後の要介護度
  previous_care_level VARCHAR(20),           -- 初回登録時は NULL
  new_care_level      VARCHAR(20) NOT NULL,  -- 'support_1' .. 'care_5'
  changed_at          DATE NOT NULL,
  reason              TEXT,                  -- 認定更新・区分変更など

  -- 監査
  recorded_by         UUID NOT NULL REFERENCES app_users(id),
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT care_level_values_valid
    CHECK (new_care_level IN (
      'support_1', 'support_2',
      'care_1', 'care_2', 'care_3', 'care_4', 'care_5'
    ))
);

CREATE INDEX idx_care_level_hist_tenant_recipient_changed
  ON care_level_histories(tenant_id, care_recipient_id, changed_at DESC);

ALTER TABLE care_level_histories ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_level_hist_tenant_isolation ON care_level_histories
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
```

**Supabase トリガーによる自動記録**:

```sql
CREATE OR REPLACE FUNCTION record_care_level_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.current_care_level IS DISTINCT FROM NEW.current_care_level THEN
    INSERT INTO care_level_histories (
      tenant_id, care_recipient_id, previous_care_level, new_care_level, changed_at, recorded_by
    ) VALUES (
      NEW.tenant_id, NEW.id, OLD.current_care_level, NEW.current_care_level, CURRENT_DATE, auth.uid()
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO care_level_histories (
      tenant_id, care_recipient_id, previous_care_level, new_care_level, changed_at, recorded_by
    ) VALUES (
      NEW.tenant_id, NEW.id, NULL, NEW.current_care_level, CURRENT_DATE, auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_care_recipient_level_change
  AFTER INSERT OR UPDATE ON care_recipients
  FOR EACH ROW EXECUTE FUNCTION record_care_level_change();
```

**設計判断**:

| 判断 | 理由 |
|------|------|
| 履歴は集約外テーブル + DB トリガー記録 | ドメイン層の責務を薄く保ち、監査ログとして漏れなく記録する |
| `changed_at` は DATE 型 | 要介護度変更は認定有効日単位で扱われる（時刻不要） |
| `reason` は自由記述 TEXT | MVP では分類不要。運用後に必要なら ENUM 化 |

### 5.3 ケアプラン関連テーブル DDL

> **`care_plans` / `care_plan_long_term_goals` / `care_plan_short_term_goals` / `care_plan_service_items` の DDL と設計判断、および `save_care_plan` / `create_successor_care_plan` RPC は `care-plan-aggregate-design.md §6〜§7` に移管した。**

### 5.4 DB 全体の設計判断（共通方針）

| 判断 | 理由 |
|------|------|
| 子テーブル全部に `tenant_id` を冗長に持たせる | RLS ポリシーが単純になる、クエリ性能が良い、テナント越境事故を防げる |
| `status` 系を VARCHAR + CHECK 制約 | ENUM だと値の追加が煩雑（`ALTER TYPE` 必要）。文字列なら CHECK 変更だけで済む |
| `version` カラムで楽観的ロック | 複数ユーザー同時編集に備える。加算責務は RPC 側に統一 |
| `ON DELETE CASCADE` | 集約の生存単位が一致するため連動削除（ただし MVP 後は論理削除に切り替え予定） |

### 5.5 RLS 方針

全テーブルで RLS を有効化し、以下の原則に従う:

| 判断 | 理由 |
|------|------|
| `tenant_id` ベースのシンプルなポリシーに限定 | RLS にロール制御まで載せるとロジックが分散して保守不能になる |
| ロール別アクセス制御はアプリ層で実施 | RLS は「テナント分離」だけに責務を絞る |
| MVP ではサブクエリ方式（`SELECT tenant_id FROM app_users`） | 性能問題が出たら JWT カスタムクレーム方式に移行可能 |

各テーブル固有の RLS ポリシー:
- ケアプラン関連 → `care-plan-aggregate-design.md §6.5`
- アセスメント関連 → `assessment-aggregate-design.md §6.3`
- ナレッジ関連 → `knowledge-context-design.md §5`
- AI 生成ログ → `pii-masking-design.md §6.2`

---

## 6. リポジトリ層の設計原則

### 6.1 設計原則

| 原則 | 内容 |
|------|------|
| ドメイン層にはインターフェースだけ | 実装はインフラ層に置き、依存方向を `infrastructure → domain` に保つ |
| リポジトリは集約単位 | 集約内部のエンティティ（長期目標等）を直接扱うリポジトリは作らない |
| 集約全体を 1 トランザクションで保存 | 集約の整合性を永続化レベルでも守る |
| マッパーでドメイン ↔ DB 変換 | リポジトリの肥大化を防ぎ、純粋な変換関数として単体テスト可能にする |
| 子エンティティ ID の永続性契約 | 「全削除→再挿入」戦略では必ずドメインの `id.value` をペイロードに含める |

### 6.2 集約別リポジトリ詳細

| リポジトリ | 詳細ドキュメント |
|-----------|----------------|
| `ICareRecipientRepository` | 本ドキュメント §4.3.4 |
| `ICarePlanRepository` | `care-plan-aggregate-design.md §7` |
| `IAssessmentRepository` | `assessment-aggregate-design.md §7` |
| `IKnowledgeDocumentRepository` / `IKnowledgeSearchService` | `knowledge-context-design.md §2.4, §4-§6` |
| `IAiGenerationLogRepository` | `ai-support-context-design.md §7` |

---

## 7. ユースケース層の設計

### 7.1 設計原則

| 原則 | 内容 |
|------|------|
| 1 ユースケース = 1 クラス | Command Object パターン。ファイル単位で変更理由が一意になる |
| 入出力を DTO で明示 | ドメインオブジェクトを画面に直接返さない |
| ユースケースは薄く保つ | 理想は 20〜50 行。複雑になったらドメイン層へロジックを移す |
| 業務ルールは書かない | ロジックはドメイン層。ユースケースは取得・呼び出し・保存の調整役 |
| `AuthorizationContext` を全入力に含める | マルチテナント・権限チェックを入口で必ず実施 |

### 7.2 共通の型定義

```typescript
// application/shared/AuthorizationContext.ts

export interface AuthorizationContext {
  userId: string;
  tenantId: string;
  role: 'care_manager' | 'admin';
}

// application/shared/IUseCase.ts

export interface IUseCase<TInput, TOutput> {
  execute(input: TInput): Promise<TOutput>;
}

// application/shared/UseCaseError.ts

export type UseCaseErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'INCONSISTENT_DATA'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

export class UseCaseError extends Error {
  constructor(
    public readonly code: UseCaseErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'UseCaseError';
  }
}
```

### 7.3 ケアプラン作成フロー全体

> **フロー図およびステップごとのユースケース責務は `care-plan-aggregate-design.md §8.1` に移管した。**

補足: [5] アセスメント確定は [6] ドラフト生成の前提条件。`GenerateCarePlanDraftUseCase` は `Finalized` アセスメントのみ受け付ける。詳細は `assessment-aggregate-design.md §5.3` 参照。

### 7.4 主要ユースケース

#### 7.4.1 アセスメント生成（2段階分割: Prepare → Generate）

PII マスキング設計（`pii-masking-design.md §5`）で確定した「人手確認ゲート必須」方針に従い、アセスメント生成は以下の **2 ユースケースに分割** する。

| フェーズ | ユースケース | 責務 |
|---------|------------|------|
| ① マスキング準備 | `PrepareAssessmentDraftUseCase` | 既知 PII 取得 → 構造化マスキング → 一時テーブル `assessment_drafts` に保存（TTL 30 分） |
| ② Gemini 送信 & 集約生成 | `GenerateAssessmentFromMaskedTextUseCase` | ユーザー承認済みマスク後テキストで Gemini 要約 → `Assessment` 集約生成・保存 |

詳細なコード例は `pii-masking-design.md §5.2/5.3` を参照。アセスメント集約との接続は `assessment-aggregate-design.md §8.1` を参照。プロンプトと Zod スキーマは `ai-support-context-design.md §3.3 §4.2` を参照。

**分割の本質的メリット**: 「人手確認を経ずに Gemini に送られる経路がコード上存在しない」ことを構造的に保証できる。

**設計判断**

| 判断 | 理由 |
|------|------|
| マスキングを `IPiiMaskingService` で抽象化 | ドメインは「マスキングする」意図のみ知る。実装（`StructuredPiiMaskingService`）は差し替え可能 |
| 文字起こしはユースケース外（クライアント完結） | Web Speech API でブラウザ内処理。精度不足時の Gemini Audio フォールバックは別ユースケース |
| マスキング前の原文を `assessment_drafts` に保持（TTL 30 分） | 人手確認・再実行を可能にしつつ、失効管理で PII 長期滞留を防ぐ |
| 確定後は `assessments.source_transcript` に原文を永続化 | 監査証跡 + 再要約可能性を確保（詳細は `assessment-aggregate-design.md §6.4`） |

#### 7.4.2 状態遷移ユースケース（薄い例）

> **ケアプラン状態遷移ユースケースの実装例は `care-plan-aggregate-design.md §8.2` に移管した。**

### 7.5 Server Action からの呼び出し例

```typescript
// app/care-plans/actions.ts
'use server';

export async function submitCarePlanForReviewAction(carePlanId: string) {
  const auth = await getCurrentAuth();
  const container = buildContainer();

  try {
    await container.submitCarePlanForReviewUseCase.execute({
      auth,
      carePlanId,
    });
    return { success: true };
  } catch (error) {
    if (error instanceof UseCaseError) {
      return { success: false, code: error.code, message: error.message };
    }
    console.error(error);
    return { success: false, code: 'INTERNAL_ERROR', message: '予期しないエラー' };
  }
}
```

ユースケースは **Server Action / API Route / バックグラウンドジョブから共通で呼べる** 設計とする。

#### 7.5.1 Supabase クライアントの使い分け（重要）

| 呼び出し元 | 使用クライアント | RLS |
|-----------|--------------|-----|
| Server Action（ユーザー操作） | `@supabase/ssr` の `createServerClient` + 認証 Cookie | **有効**（auth.uid() ベース） |
| API Route（ユーザー認証必須） | 同上 | **有効** |
| Vercel Cron / バックグラウンドジョブ | `createClient(url, SERVICE_ROLE_KEY)` | **無効**（必要に応じて手動でテナント条件を付与） |
| ドメイン層 / ユースケース層 | クライアントを直接持たず、リポジトリ経由でのみアクセス | - |

**原則**: 認証済みユーザーの操作で起動するパスは必ず JWT 伝搬で RLS を有効化する。`service_role` 利用は「ユーザー文脈を持たない場面」（Cron、管理バッチ）に限定する。`service_role` を使うユースケースでは、コード側で `tenant_id` の明示的な WHERE 絞り込みを入れる（例: Cron が特定テナントのキューのみ処理する）。

### 7.6 コミュニケーション支援ユースケース（メール返信ドラフト）

#### 7.6.1 DraftEmailReplyUseCase

メール返信は「貼り付け本文を Gemini に渡してドラフトを返す」軽量なユースケース。集約を持たず、`ai_generation_logs` のみに記録する。

```typescript
// application/communication/DraftEmailReplyUseCase.ts

export interface DraftEmailReplyInput {
  auth: AuthorizationContext;
  /** ケアマネが貼り付けたメール本文 */
  incomingEmailBody: string;
  /** 任意: 返信の方向性指示（"丁寧に断る" 等） */
  intent?: string;
}

export interface DraftEmailReplyOutput {
  /** 画面表示用にアンマスク済みドラフト */
  draftReply: string;
  /** マスキング統計（人手確認画面用） */
  maskingStats: MaskingStatistics;
}

export class DraftEmailReplyUseCase
  implements IUseCase<DraftEmailReplyInput, DraftEmailReplyOutput> {

  constructor(
    private readonly careRecipientRepo: ICareRecipientRepository,
    private readonly piiMasking: IPiiMaskingService,
    private readonly emailReplyService: IEmailReplyDraftService,
    private readonly aiLogRepo: IAiGenerationLogRepository,
  ) {}

  async execute(input: DraftEmailReplyInput): Promise<DraftEmailReplyOutput> {
    const tenantId = new TenantId(input.auth.tenantId);

    // 1. テナント内の全利用者 PII を KnownPiiSet にまとめる
    //    （メール本文には利用者氏名が含まれる可能性が高い）
    const knownPiis = await this.careRecipientRepo.buildKnownPiiSetForTenant(tenantId);

    // 2. レイヤー1 マスキング（メール本文にも適用）
    const maskingResult = await this.piiMasking.mask(input.incomingEmailBody, knownPiis);

    // 3. Gemini にドラフト生成を依頼
    const draftResult = await this.emailReplyService.draft({
      maskedIncomingEmail: maskingResult.maskedText,
      intent: input.intent,
    });

    // 4. 監査ログ記録
    await this.aiLogRepo.save({
      tenantId,
      kind: 'email_reply_draft',
      originalText: maskingResult.originalText,
      maskedText: maskingResult.maskedText,
      placeholderMap: maskingResult.placeholders,
      aiResponse: draftResult.rawResponse,
      aiModel: 'gemini-1.5-flash',
      promptTemplateId: draftResult.promptTemplateId,
      createdBy: new UserId(input.auth.userId),
    });

    // 5. ドラフト中のプレースホルダを画面表示用にアンマスク
    const unmaskedDraft = maskingResult.unmask(draftResult.draftReply);

    return {
      draftReply: unmaskedDraft,
      maskingStats: maskingResult.statistics,
    };
  }
}
```

#### 7.6.2 設計判断

| 判断 | 理由 |
|------|------|
| 集約化しない | 業務ロジックなし。MVP スコープでは「変換処理」に過ぎない |
| 人手確認ゲートを UI 側に置く（必須） | 送信ボタンはアプリになく、最終的にケアマネが自分のメールソフトに貼り付けるため、人手確認は自然に組み込まれる |
| `knownPiis` はテナント全利用者から構築 | メール本文にどの利用者の名前が出るかわからないため。パフォーマンス懸念は利用者数 < 200 想定なら問題なし |
| アンマスクをユースケースで実施 | ケアマネが読むドラフトは元の表記に戻すのが自然 |
| `ai_generation_logs` に `kind='email_reply_draft'` で記録 | 「何を送って何が返ったか」の監査性を確保 |

### 7.7 ケアプランドラフト生成ユースケース（RAG 連携）

ナレッジ RAG を使ってケアプランドラフトを生成する。

```typescript
// application/care-management/care-plan-draft/GenerateCarePlanDraftUseCase.ts

export class GenerateCarePlanDraftUseCase
  implements IUseCase<GenerateCarePlanDraftInput, GenerateCarePlanDraftOutput> {

  constructor(
    private readonly careRecipientRepo: ICareRecipientRepository,
    private readonly assessmentRepo: IAssessmentRepository,
    private readonly knowledgeSearch: IKnowledgeSearchService,
    private readonly carePlanGeneration: ICarePlanGenerationService,
    private readonly piiMasking: IPiiMaskingService,
    private readonly aiLogRepo: IAiGenerationLogRepository,
  ) {}

  async execute(input: GenerateCarePlanDraftInput): Promise<GenerateCarePlanDraftOutput> {
    const tenantId = new TenantId(input.auth.tenantId);

    // 1. アセスメントと利用者を取得（両方とも Finalized/有効であること）
    const assessment = await this.assessmentRepo.findById(
      new AssessmentId(input.assessmentId), tenantId,
    );
    if (!assessment || assessment.status !== AssessmentStatus.Finalized) {
      throw new UseCaseError('INVALID_INPUT', '確定済みアセスメントのみドラフト生成の基礎にできます');
    }
    const recipient = await this.careRecipientRepo.findById(
      assessment.careRecipientId, tenantId,
    );
    if (!recipient) throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');

    // 2. アセスメントの課題から検索クエリを作成し RAG 検索（マスク済みのまま）
    const searchQueryText = assessment.issues
      .map(i => i.description)
      .join('\n');
    const relevantKnowledge = await this.knowledgeSearch.searchByText({
      queryText: searchQueryText,
      tenantId,
      requesterId: new UserId(input.auth.userId),
      topK: 5,
      minSimilarity: 0.5,
    });

    // 2.5. RAG 結果を Gemini 投入前に再マスキング（多層防御）
    //      詳細は knowledge-context-design.md §7.3 参照
    //      最適化: scope='personal' のチャンクのみ再マスキング対象に絞る余地あり
    const knownPiis = await this.careRecipientRepo.buildKnownPiiSetForTenant(tenantId);
    const reMaskedSnippets = await Promise.all(
      relevantKnowledge.map(async (k) => {
        const result = await this.piiMasking.mask(k.chunkText, knownPiis);
        return {
          title: k.documentTitle,
          text: result.maskedText,
          source: `${k.documentTitle} p.${k.chunkPageNumber ?? '-'}`,
          similarity: k.similarity,
        };
      }),
    );

    // 3. Gemini にドラフト生成を依頼（マスク済み入力 + RAG コンテキスト）
    const draftResult = await this.carePlanGeneration.generateDraft({
      assessmentMaskedSummary: assessment.maskedSummary,
      issuesMasked: assessment.issues.map(i => ({
        category: i.category,
        description: i.description,
        priority: i.priority,
      })),
      recipientContext: {
        careLevel: recipient.currentCareLevel.value,
        ageRange: recipient.ageRange,
      },
      knowledgeSnippets: reMaskedSnippets,
    });

    // 4. 監査ログ記録
    await this.aiLogRepo.save({
      tenantId,
      kind: 'care_plan_draft',
      originalText: null,         // 単一ソースは assessment.source_transcript
      maskedText: assessment.maskedSummary,
      placeholderMap: [],         // アセスメント側で保持済み
      aiResponse: draftResult.rawResponse,
      aiModel: 'gemini-1.5-flash',
      promptTemplateId: draftResult.promptTemplateId,
      relatedEntityType: 'assessment',
      relatedEntityId: assessment.id.value,
      createdBy: new UserId(input.auth.userId),
    });

    // 5. ドラフトをそのまま返却（保存は別ユースケース CreateCarePlanFromDraftUseCase）
    return {
      longTermGoals: draftResult.longTermGoals,
      shortTermGoals: draftResult.shortTermGoals,
      serviceItemCandidates: draftResult.serviceItemCandidates,
      citedKnowledge: relevantKnowledge.map(k => ({
        title: k.documentTitle,
        page: k.chunkPageNumber,
        scope: k.scope,
      })),
    };
  }
}
```

**設計判断**:

| 判断 | 理由 |
|------|------|
| RAG 検索入力はマスク済みテキスト | PII を Gemini Embedding にも渡さない。アセスメントが既にマスク済み要約を保持しているので自然 |
| RAG 結果を Gemini 投入前に再マスキング | 個人ナレッジに PII が紛れ込んでいる可能性を想定した多層防御（`knowledge-context-design.md §7.3`） |
| 検索対象は `processing_status='ready'` のみ | `search_knowledge` RPC 内でフィルタ済み |
| 引用情報（出典）を返却 | ケアマネが AI ドラフトを評価する際の根拠表示 |
| ドラフトは集約化しない | 「未保存の中間結果」は `ai_generation_logs` のみ。ケアマネが採用した時点で `CreateCarePlanFromDraftUseCase` で集約化 |

プロンプトテンプレート・Zod スキーマ・`ICarePlanGenerationService` 実装の詳細は `ai-support-context-design.md §3.4, §4.3, §6` を参照。

### 7.8 エラーハンドリング方針

#### 7.8.1 UseCaseError → レスポンスコードのマッピング

Server Action / API Route では `UseCaseError` を共通形式に変換する。

| `UseCaseErrorCode` | Server Action 返却 | HTTP ステータス（API Route） | ユーザー向け表示 |
|-------------------|-------------------|-------------------------|----------------|
| `NOT_FOUND` | `{ success: false, code: 'NOT_FOUND' }` | 404 | 「対象が見つかりません」 |
| `FORBIDDEN` | `{ success: false, code: 'FORBIDDEN' }` | 403 | 「権限がありません」 |
| `INVALID_INPUT` | `{ success: false, code: 'INVALID_INPUT', message }` | 400 | 入力エラーメッセージ表示 |
| `INCONSISTENT_DATA` | `{ success: false, code: 'INCONSISTENT_DATA' }` | 409 | 「データ整合性エラー。再読み込みしてください」 |
| `CONFLICT` | `{ success: false, code: 'CONFLICT' }` | 409 | 「他のユーザーが更新しました。再読み込みしてください」（楽観的ロック競合） |
| `INTERNAL_ERROR` | `{ success: false, code: 'INTERNAL_ERROR' }` | 500 | 「予期しないエラーが発生しました」 |

#### 7.8.2 ドメイン例外 → UseCaseError への変換

| ドメイン例外 | `UseCaseErrorCode` |
|------------|-------------------|
| `DomainValidationError`（各種 `*ValidationError`） | `INVALID_INPUT` |
| `IllegalStateTransitionError` | `INVALID_INPUT` |
| `OptimisticLockError` | `CONFLICT` |
| `RepositoryError` | `INTERNAL_ERROR`（+サーバーログ） |
| `MaskingError` | `INTERNAL_ERROR`（+サーバーログ） |

ユースケース層の責務は「ドメイン例外を適切な `UseCaseError` に詰め替えて投げる」こと。Server Action 層では `UseCaseError` 以外の例外は必ず `INTERNAL_ERROR` として扱い、詳細をログに残す。

```typescript
// 例: ユースケース層の詰め替え
try {
  carePlan.finalize();
} catch (error) {
  if (error instanceof IllegalStateTransitionError || error instanceof CarePlanValidationError) {
    throw new UseCaseError('INVALID_INPUT', error.message, error);
  }
  throw error;
}
```

### 7.9 ケアプランのバージョニング方針

> **「月次見直しは新レコード」方針と `CreateSuccessorCarePlanUseCase` の実装例は `care-plan-aggregate-design.md §8.5` に移管した。**

---

## 8. ディレクトリ構成

```
src/
├── domain/                          # ★ Next.js / Supabase に一切依存しない
│   ├── care-management/
│   │   ├── care-recipient/
│   │   │   ├── CareRecipient.ts
│   │   │   ├── CareLevel.ts
│   │   │   ├── CareRecipientId.ts
│   │   │   └── ICareRecipientRepository.ts
│   │   ├── care-plan/               # ← care-plan-aggregate-design.md §3 参照
│   │   │   ├── CarePlan.ts
│   │   │   ├── CarePlanId.ts
│   │   │   ├── LongTermGoal.ts
│   │   │   ├── ShortTermGoal.ts
│   │   │   ├── ServiceItem.ts
│   │   │   ├── CarePlanStatus.ts
│   │   │   ├── PlanPeriod.ts
│   │   │   └── ICarePlanRepository.ts
│   │   ├── assessment/              # ← assessment-aggregate-design.md §3 参照
│   │   │   ├── Assessment.ts
│   │   │   └── IAssessmentRepository.ts
│   │   └── shared/
│   ├── ai-support/                  # ← ai-support-context-design.md §6, pii-masking-design.md §3 参照
│   │   ├── masking/
│   │   │   ├── PiiPlaceholder.ts
│   │   │   ├── MaskingResult.ts
│   │   │   └── IPiiMaskingService.ts
│   │   ├── IAiSummarizationService.ts
│   │   ├── ICarePlanGenerationService.ts
│   │   ├── IEmailReplyDraftService.ts
│   │   ├── IEmbeddingService.ts
│   │   └── IAiGenerationLogRepository.ts
│   ├── knowledge/                   # ← knowledge-context-design.md §2 参照
│   │   ├── document/
│   │   │   ├── KnowledgeDocument.ts
│   │   │   ├── KnowledgeChunk.ts
│   │   │   ├── KnowledgeScope.ts
│   │   │   ├── ProcessingStatus.ts
│   │   │   └── IKnowledgeDocumentRepository.ts
│   │   └── search/
│   │       ├── KnowledgeSearchView.ts
│   │       └── IKnowledgeSearchService.ts
│   └── shared/
│       ├── TenantId.ts
│       ├── UserId.ts
│       └── errors/
│           ├── DomainError.ts
│           ├── ValidationError.ts
│           └── IllegalStateTransitionError.ts
│
├── application/                     # ユースケース層
│   ├── care-management/
│   │   ├── care-plan/
│   │   │   ├── CreateCarePlanFromDraftUseCase.ts
│   │   │   ├── CreateSuccessorCarePlanUseCase.ts
│   │   │   ├── UpdateCarePlanUseCase.ts
│   │   │   ├── SubmitCarePlanForReviewUseCase.ts
│   │   │   ├── FinalizeCarePlanUseCase.ts
│   │   │   └── dto/
│   │   ├── assessment/
│   │   │   ├── PrepareAssessmentDraftUseCase.ts
│   │   │   ├── GenerateAssessmentFromMaskedTextUseCase.ts
│   │   │   ├── GetAssessmentForViewUseCase.ts
│   │   │   └── FinalizeAssessmentUseCase.ts
│   │   └── care-plan-draft/
│   │       └── GenerateCarePlanDraftUseCase.ts
│   ├── knowledge/
│   │   ├── UploadKnowledgeDocumentUseCase.ts
│   │   ├── DeleteKnowledgeDocumentUseCase.ts
│   │   ├── ProcessKnowledgeEmbeddingsUseCase.ts
│   │   └── CleanupOrphanedStorageUseCase.ts
│   ├── communication/
│   │   └── DraftEmailReplyUseCase.ts
│   └── shared/
│       ├── IUseCase.ts
│       ├── AuthorizationContext.ts
│       └── UseCaseError.ts
│
├── infrastructure/                  # 実装層
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── client.ts
│   │   ├── types.ts                 # 自動生成型
│   │   └── migrations/
│   ├── repositories/
│   │   ├── SupabaseCarePlanRepository.ts
│   │   ├── SupabaseCareRecipientRepository.ts
│   │   ├── SupabaseAssessmentRepository.ts
│   │   ├── SupabaseKnowledgeDocumentRepository.ts
│   │   ├── SupabaseKnowledgeSearchService.ts
│   │   ├── SupabaseAiGenerationLogRepository.ts
│   │   └── mappers/
│   │       ├── CarePlanMapper.ts
│   │       └── AssessmentMapper.ts
│   ├── ai/                          # ← ai-support-context-design.md §2.1 参照
│   │   ├── GeminiClient.ts
│   │   ├── GeminiAiSummarizationService.ts
│   │   ├── GeminiCarePlanGenerationService.ts
│   │   ├── GeminiEmailReplyDraftService.ts
│   │   ├── GeminiEmbeddingService.ts
│   │   ├── prompts/
│   │   │   └── v1/
│   │   │       ├── assessment-summarization.ts
│   │   │       ├── care-plan-draft.ts
│   │   │       └── email-reply-draft.ts
│   │   ├── schemas/
│   │   │   ├── assessment-summarization.ts
│   │   │   ├── care-plan-draft.ts
│   │   │   └── email-reply-draft.ts
│   │   └── masking/
│   │       ├── StructuredPiiMaskingService.ts
│   │       └── regex-patterns.ts
│   ├── auth/
│   │   └── getCurrentAuth.ts
│   └── di/
│       └── container.ts
│
└── app/                             # Next.js App Router
    ├── care-plans/
    │   ├── actions.ts               # Server Actions
    │   └── page.tsx
    └── ...
```

**構造の意図**
- `domain/` は完全にフレームワーク非依存（`@supabase/*` も `next/*` も import しない）
- 依存方向は `app → infrastructure → domain` および `app → application → domain`
- ドメイン層だけで単体テストが完結する

---

## 9. MVP 優先度マトリクス

### 9.1 ドメイン層

| 優先度 | 項目 |
|---|---|
| 🔴 必須 | 集約ルート経由でのみ更新できる構造 |
| 🔴 必須 | `tenantId` を集約に持たせる |
| 🔴 必須 | ファクトリメソッドで不変条件チェック |
| 🟡 推奨 | 状態遷移メソッド |
| 🟡 推奨 | 値オブジェクト（最低限：`CareLevel`, `TenantId`, 各種 ID） |
| 🟢 後回し | ドメインイベント |
| 🟢 後回し | 全項目の値オブジェクト化 |

集約別詳細:
- ケアプラン → `care-plan-aggregate-design.md §10`
- アセスメント → `assessment-aggregate-design.md §10`
- ナレッジ → `knowledge-context-design.md §10`

### 9.2 DB スキーマ

| 優先度 | 項目 |
|---|---|
| 🔴 必須 | `tenant_id` を全テーブルに |
| 🔴 必須 | RLS によるテナント分離 |
| 🔴 必須 | CHECK 制約で不変条件を DB でも守る |
| 🟡 推奨 | `version` カラムによる楽観的ロック |
| 🟡 推奨 | RPC 関数でのトランザクション境界 |
| 🟢 後回し | 論理削除（`deleted_at`） |
| 🟢 後回し | 監査ログテーブル |
| 🟢 後回し | JWT カスタムクレームによる RLS 高速化 |

### 9.3 ユースケース層

| 優先度 | 項目 |
|---|---|
| 🔴 必須 | 1 ユースケース 1 クラス |
| 🔴 必須 | DTO による入出力の明示 |
| 🔴 必須 | `AuthorizationContext` を必ず受け取る |
| 🔴 必須 | ドメイン例外の適切な伝播 |
| 🟡 推奨 | ユースケース単体テスト |
| 🟡 推奨 | `UseCaseError` で標準化 |
| 🟢 後回し | トランザクション管理ミドルウェア |
| 🟢 後回し | 自動ロギング・メトリクス |

---

## 10. 未決定事項・今後の論点

以下は本ドキュメント作成時点で未確定または別ドキュメントで扱う事項。

### 10.1 ドメイン側の未決定事項

- [x] **要介護度の履歴持ち方** → 最新値のみ集約 + `care_level_histories` テーブル（トリガー記録）で確定（§5.2）
- [x] **アセスメント集約の詳細設計** → `assessment-aggregate-design.md` で確定
- [x] **ケアプラン集約の詳細設計** → `care-plan-aggregate-design.md` で確定
- [x] **ケアプランのバージョニング** → 計画期間ごとに新レコード作成、前プランは `archive()` で確定（`care-plan-aggregate-design.md §8.5`）
- [ ] **ケアプラン `InReview` 状態の要否** → 実装前にユーザーと再確認。不要なら 3 状態に単純化（`care-plan-aggregate-design.md §5.4`）
- [ ] **モニタリング機能**: MVP スコープ外。ケアプラン集約への影響は現時点で軽微（`Archived` 状態のプランに対するモニタリング結果を別集約で紐付ける想定）

### 10.2 AI 支援コンテキストの設計

- [x] **PII マスキング戦略** → `pii-masking-design.md` で確定（レイヤー1 + レイヤー3 人手ゲート、2 段階ユースケース分割）
- [x] **Gemini 呼び出しの抽象化方針・プロンプトテンプレート管理・JSON スキーマ検証・モデル選定・AI 生成ログ** → `ai-support-context-design.md` で確定（`IAiSummarizationService` / `ICarePlanGenerationService` / `IEmbeddingService` 3 分離、`prompts/v1/*.ts`、Zod + `responseSchema` JSON 強制、`gemini-1.5-flash` + `text-embedding-004`、`GeminiClient` 低レイヤ共通化）
- [x] **ストリーミングレスポンス** → **MVP スコープ外**（運用開始後の UX 改善項目）
- [x] **ケアプラン PDF/Word エクスポート** → **MVP スコープ外**。画面閲覧のみ MVP 対応、紙出力は第二フェーズ

### 10.3 ナレッジコンテキストの設計

- [x] pgvector を使った RAG 設計 → `knowledge-context-design.md §4〜§6`
- [x] 個人ナレッジと共有ナレッジのアクセス制御（RLS で分離） → `knowledge-context-design.md §5` の `can_access_knowledge` 関数で実装
- [x] 埋め込みモデルの選定 → Gemini `text-embedding-004`（768 次元）
- [x] チャンク分割戦略 → 固定 800 文字 + 100 文字オーバーラップ
- [ ] RAG 結果再マスキングの scope 絞り込み最適化 → `scope='personal'` のチャンクのみ対象にする（実装着手後、運用状況で判断）

### 10.4 Next.js 結合層の設計

- [x] エラーハンドリングの統一（`UseCaseError` → HTTP ステータス変換） → §7.8 で確定
- [x] Server Action と API Route の使い分け方針 → **原則 Server Action**。例外: ファイルアップロード（Vercel のリクエストサイズ制限対策で API Route 使用）、Vercel Cron（API Route + `Authorization: Bearer CRON_SECRET` で保護）
- [x] React Server Components とユースケース層の境界 → **読み取り系は RSC から直接呼び出し可**（`await container.getXxxUseCase.execute(...)`）。**書き込みは必ず Server Action 経由**
- [x] ストリーミング UI の実装パターン → **MVP は非ストリーミング**

### 10.5 マルチテナント・認証の詳細

- [x] Supabase Auth と `app_users` テーブルの同期戦略 → `auth.users` INSERT 後の Database Trigger で `app_users` を自動作成（§5.1.1 参照）
- [x] テナント招待フロー → 管理者が `supabase.auth.admin.inviteUserByEmail(email, { data: { tenant_id, role } })` を Server Action から呼び出す。被招待者がメールリンクからパスワード設定 → `auth.users` INSERT → Trigger → `app_users` 作成の流れ（§5.1.1 コード例参照）。初回テナント作成（事業所登録）は管理者ツール（Supabase Dashboard or Migration スクリプト）で行い、MVP ではセルフサービス登録は不要
- [ ] ロール拡張（現状：`care_manager` / `admin` のみ）：MVP スコープ外

### 10.6 運用・監視

- [ ] エラー監視（Sentry 等）
- [ ] AI コール監視（コスト・レイテンシ） → `ai_generation_logs` からの集計が一次データ（`ai-support-context-design.md §5.4`）
- [ ] 監査ログの仕組み

---

## 付録 A: 業務用語集

業務用語の定義は **要件定義書 `ai_care_mg.md` §8** を正とする。

このドキュメント固有の補足:

| 用語 | 補足（設計文脈） |
|------|----------------|
| ドラフト | ケアマネジメント文脈では「ケアプランの原案」。AI 支援文脈では「LLM の生成結果」。境界づけられたコンテキストにより同じ言葉が異なる意味を持つことを意図的に許容する（§3.2 理由2） |

## 付録 B: DDD 用語集

| 用語 | 定義 |
|------|------|
| 境界づけられたコンテキスト | ユビキタス言語が一貫して通じる範囲。設計上の境界 |
| 集約（Aggregate） | トランザクション整合性を守る単位 |
| 集約ルート（Aggregate Root） | 集約への唯一のアクセス窓口となるエンティティ |
| エンティティ | 同一性（ID）で識別されるオブジェクト |
| 値オブジェクト | 属性の組み合わせで識別されるオブジェクト（不変） |
| ドメインサービス | 単一エンティティに収まらないドメインロジックを置く場所 |
| リポジトリ | 集約の永続化を担うインターフェース |
| ファクトリ | 複雑な集約生成ロジックをカプセル化 |
| ユビキタス言語 | チーム全員が同じ意味で使う業務用語 |
| 不変条件（Invariant） | 集約が常に満たすべき条件 |

---

**ドキュメントバージョン**: 0.4（集約分離・AI 支援コンテキスト分離反映版）
**最終更新**: 2026-04-24

**0.4 の主な変更点**:
- ケアプラン集約詳細（旧 §4.1〜§4.4, §5.3, §6.2〜§6.6, §7.3, §7.4.2, §7.9）を `care-plan-aggregate-design.md` に分離
- AI 支援コンテキストの詳細（プロンプト管理・Gemini クライアント・AI 生成ログ・モデル選定）を `ai-support-context-design.md` に分離
- §4 を「集約インデックスと利用者集約」に再編（利用者集約を §4.3 に統合）
- §5（DB 設計）を「全体スキーマ + テナント + 利用者 + 要介護度履歴 + 共通方針」に絞り、集約固有テーブル DDL は各専用ドキュメントへ移管
- §6 リポジトリ層を「共通設計原則 + 集約別詳細ドキュメントへのリンク」に圧縮
- §7.7 `GenerateCarePlanDraftUseCase` に RAG 結果再マスキングのステップを明示化
- ドキュメントマップをトップに追加、全セクションに適切なクロスリンクを配置
- §8 ディレクトリ構成に `prompts/v1/*` と `schemas/*` を追加

**0.3 の主な変更点**:
- §4.6 利用者集約の詳細設計を追加
- §5.1.1 `tenants` / `app_users` テーブル DDL を追加（Auth 同期トリガー含む）
- §5.1.2 `care_recipients` テーブル DDL を追加
- §6.6 `create_successor_care_plan` RPC を追加（後継ケアプランの 2 集約原子保存）
- §10.2 プロンプトテンプレート管理・AI 生成結果スキーマ検証を確定
- §10.4 Server Action/API Route 使い分け・RSC 境界を確定
- §10.5 Supabase Auth 同期戦略・テナント招待フローを確定

**0.2 の主な変更点**:
- §4.3.3 状態遷移ルールを明示化
- §4.3.4 `CarePlan.archive()` メソッドをコード例に追加
- §5.3 `care_plan_finalized_consistency` CHECK 制約の論理バグを修正
- §5.5 ケアプラン子テーブルに RLS `FOR ALL` ポリシーを追加
- §7.3 ケアプラン作成フローに PII マスキング 2 段階・アセスメント確定ステップを明示
- §7.4.2 `FinalizeCarePlanUseCase` から admin 限定チェックを削除
- §7.5.1 Supabase クライアント使い分け方針を追加
- §6.4 マッパー説明に子エンティティ ID 永続性の契約を追記
- §10.2 ストリーミング表示・PDF/Word エクスポートを MVP スコープ外と明示
