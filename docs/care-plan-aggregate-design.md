# ケアマネジメントコンテキスト: ケアプラン集約 詳細設計ドキュメント

> 本ドキュメントは `care-manager-ai-design.md` の §4〜§7 のうち、ケアプラン集約に固有な内容を独立ドキュメント化したもの。
> アセスメント集約（`assessment-aggregate-design.md`）と対称な構造で設計判断を記録する。
> 親ドキュメントにはケアマネジメントコンテキスト全体の俯瞰・コンテキスト間連携・境界づけられたコンテキスト論を残す。

**ドキュメントバージョン**: 0.1（分離時点）
**最終更新**: 2026-04-24
**親ドキュメント**: `care-manager-ai-design.md`
**関連ドキュメント**: `assessment-aggregate-design.md`, `pii-masking-design.md`, `ai-support-context-design.md`, `knowledge-context-design.md`

---

## 1. 背景と方針

### 1.1 親ドキュメントでの位置づけ

ケアマネジメントコンテキスト内の中核集約。利用者の課題・目標・サービス内容を表現する「居宅サービス計画書」そのもの。アセスメント集約を ID 参照する。

### 1.2 確定した設計判断（意思決定の記録）

| 項目 | 採用方針 | 決定理由 |
|------|---------|---------|
| 集約境界 | 長期目標・短期目標・サービス内容を**同一集約内に包含** | 整合性（目標とサービスの対応）が不変条件。集約で守るべき関心事 |
| 状態遷移 | `Draft → InReview → Finalized → Archived` の 4 状態 | 介護保険制度上、確定ケアプランは利用者・家族の同意記録。`InReview` はレビュー運用の拡張余地として維持 |
| 確定前破棄 | **禁止**（`Draft` / `InReview` → `Archived` は不可） | 確定前のケアプランは別プラン作成 or 物理削除運用。監査性を損ねる「途中破棄」を排除 |
| バージョニング | **計画期間ごとに別レコード作成** | 「1 レコード = 1 計画」を保ち、監査性・時系列照会を単純化 |
| 楽観的ロック | ドメインは `version` を変更しない、RPC が検証 + 加算 | 他集約（Assessment / KnowledgeDocument）と方針統一 |
| 子テーブル永続化 | **全削除 → 再挿入戦略**（同一 ID を再挿入） | 差分更新より実装シンプル、集約整合性が確実。子エンティティ ID は永続化契約で維持 |

### 1.3 採用しなかった選択肢

| 選択肢 | 採用しなかった理由 |
|--------|------------------|
| 利用者集約にケアプランを内包 | ライフサイクルが違う（利用者は長寿、ケアプランは月次）→ 集約肥大の典型 |
| 目標とサービス内容を別集約 | 整合性（目標 → サービス対応）を跨ぐトランザクションが複雑化 |
| `version` カラムで履歴管理（同一レコード上書き） | 集約肥大、クエリ複雑化 |
| 同一レコードを上書き（新計画期間で UPDATE） | 過去計画が失われ、監査・経緯確認不能 |
| Draft → 2 状態に単純化 | `InReview` を将来のレビュー運用の拡張余地として維持（ただし §5.4 で「不要なら簡素化」を論点として残す） |

---

## 2. 集約境界

### 2.1 集約構造図

```
┌──────────────────────────────────┐
│ 【集約】ケアプラン                 │
│  Root: CarePlan                  │
│  ├ 長期目標 LongTermGoal[]        │
│  ├ 短期目標 ShortTermGoal[]       │
│  │   └ parent_long_term_goal_id  │
│  ├ サービス内容 ServiceItem[]      │
│  │   └ related_short_term_goal_id│
│  ├ 計画期間 PlanPeriod            │
│  └ ステータス CarePlanStatus      │
└──────────────────────────────────┘
         │ ID 参照
         ▼
┌──────────────────────────────────┐
│ 【集約】利用者                     │
│  Root: CareRecipient             │
└──────────────────────────────────┘
         │ ID 参照
         ▼
┌──────────────────────────────────┐
│ 【集約】アセスメント                │
│  Root: Assessment                │
│  （必ず Finalized 状態）           │
└──────────────────────────────────┘
```

### 2.2 他集約との関係

| 関係元 | 関係先 | 方式 |
|-------|-------|------|
| CarePlan → CareRecipient | `careRecipientId: CareRecipientId` | ID 参照 |
| CarePlan → Assessment | `assessmentId: AssessmentId`（**Finalized 必須**） | ID 参照 + ユースケース層チェック |
| CarePlan → CarePlan | 新プランと前プラン | `CreateSuccessorCarePlanUseCase` が前プランを `Archived` に遷移させる |

### 2.3 集約分割の理由

**なぜ「利用者」と「ケアプラン」を分けるか**
- ライフサイクルが違う: 利用者は長寿、ケアプランは月次見直し
- 同一集約にすると、利用者取得のたびに全ケアプラン履歴を読み込む集約肥大の典型

**なぜ「ケアプラン」に目標・サービス内容を内包するか**
- 整合性が必須: 長期目標と短期目標の整合性、サービス内容と目標の対応関係
- 「長期目標だけ更新されたが短期目標は古いまま」という状態は業務として破綻
- ケアマネが「ケアプランを保存する」という単一業務アクションで全体が更新される

DDD の「**不変条件は同じ集約内で守る**」原則そのもの。

**なぜ「アセスメント」を別集約にするか**
- 作成タイミングが違う（訪問ごと、複数ケアプランの基礎になる）
- ケアプラン作成前にアセスメント単独で存在する
- 再利用される（次回見直し時に過去アセスメント参照）

---

## 3. ドメインモデル設計

### 3.1 値オブジェクト・列挙型

```typescript
// domain/care-management/care-plan/CarePlanStatus.ts

export enum CarePlanStatus {
  Draft = 'draft',
  InReview = 'in_review',
  Finalized = 'finalized',
  Archived = 'archived',
}

// domain/care-management/care-plan/PlanPeriod.ts

export class PlanPeriod {
  private constructor(
    public readonly from: Date,
    public readonly to: Date,
  ) {}

  static create(from: Date, to: Date): PlanPeriod {
    if (from >= to) {
      throw new CarePlanValidationError(
        '計画期間の開始日は終了日より前である必要があります',
      );
    }
    return new PlanPeriod(from, to);
  }

  contains(date: Date): boolean {
    return date >= this.from && date <= this.to;
  }

  equals(other: PlanPeriod): boolean {
    return this.from.getTime() === other.from.getTime()
        && this.to.getTime() === other.to.getTime();
  }
}
```

**`PlanPeriod` を値オブジェクト化する理由**: プリミティブ（`{ from: Date; to: Date }`）だと整合性チェックを呼び出し側で毎回書くことになる。値オブジェクトにすれば「不正な期間は存在できない」ことが型で保証され、`contains` のようなドメインロジックを自然に置ける。

### 3.2 子エンティティの型

```typescript
// domain/care-management/care-plan/LongTermGoal.ts

export class LongTermGoal {
  private constructor(
    public readonly id: LongTermGoalId,
    private _sequenceNo: number,
    private _title: string,
    private _description: string | null,
    private _targetPeriod: PlanPeriod,
  ) {}

  static create(params: {
    sequenceNo: number;
    title: string;
    description?: string | null;
    targetPeriod: PlanPeriod;
  }): LongTermGoal { /* バリデーション + new */ }

  static reconstruct(params: { /* 全フィールド（ID 含む） */ }): LongTermGoal { /* ... */ }

  get sequenceNo(): number { return this._sequenceNo; }
  get title(): string { return this._title; }
  get description(): string | null { return this._description; }
  get targetPeriod(): PlanPeriod { return this._targetPeriod; }
}

// domain/care-management/care-plan/ShortTermGoal.ts
// - parentLongTermGoalId: LongTermGoalId を必須で持つ
// - 他は LongTermGoal とほぼ同構造

// domain/care-management/care-plan/ServiceItem.ts
// - relatedShortTermGoalId: ShortTermGoalId | null（関連付け必須でない）
// - serviceType / serviceName / frequencyText / frequencyPerWeek / providerName / remarks
```

### 3.3 集約ルート: CarePlan

```typescript
// domain/care-management/care-plan/CarePlan.ts
// ※ フレームワーク非依存、純粋な TypeScript

export class CarePlan {
  private constructor(
    private readonly _id: CarePlanId,
    private readonly _tenantId: TenantId,
    private readonly _careRecipientId: CareRecipientId,
    private readonly _assessmentId: AssessmentId,
    private _planNumber: string,
    private _planPeriod: PlanPeriod,
    private _longTermGoals: LongTermGoal[],
    private _shortTermGoals: ShortTermGoal[],
    private _serviceItems: ServiceItem[],
    private _status: CarePlanStatus,
    private readonly _createdBy: UserId,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private _finalizedAt: Date | null,
    private _version: number,
  ) {}

  // ───── ファクトリメソッド ─────

  /** 新規ケアプラン作成（不変条件チェックあり） */
  static create(params: {
    tenantId: TenantId;
    careRecipientId: CareRecipientId;
    assessmentId: AssessmentId;
    planNumber: string;
    planPeriod: PlanPeriod;
    longTermGoals: LongTermGoal[];
    shortTermGoals: ShortTermGoal[];
    createdBy: UserId;
  }): CarePlan {
    if (params.longTermGoals.length === 0) {
      throw new CarePlanValidationError('長期目標は最低 1 つ必要です');
    }
    if (params.shortTermGoals.length === 0) {
      throw new CarePlanValidationError('短期目標は最低 1 つ必要です');
    }
    CarePlan.validateGoalRelations(params.longTermGoals, params.shortTermGoals);

    const now = new Date();
    return new CarePlan(
      CarePlanId.generate(),
      params.tenantId,
      params.careRecipientId,
      params.assessmentId,
      params.planNumber,
      params.planPeriod,
      params.longTermGoals,
      params.shortTermGoals,
      [],                          // 作成直後はサービス内容なし
      CarePlanStatus.Draft,
      params.createdBy,
      now,
      now,
      null,
      1,
    );
  }

  /** リポジトリから復元（バリデーションなし） */
  static reconstruct(params: { /* 全フィールド */ }): CarePlan {
    return new CarePlan(/* ... */);
  }

  // ───── ドメインロジック ─────

  addShortTermGoal(goal: ShortTermGoal): void {
    this.assertEditable();
    const parentExists = this._longTermGoals.some(
      lt => lt.id.equals(goal.parentLongTermGoalId),
    );
    if (!parentExists) {
      throw new CarePlanValidationError(
        '短期目標は既存の長期目標に紐づく必要があります',
      );
    }
    this._shortTermGoals.push(goal);
    this.touch();
  }

  submitForReview(): void {
    if (this._status !== CarePlanStatus.Draft) {
      throw new IllegalStateTransitionError(
        `Draft からのみレビュー依頼可能です。現在: ${this._status}`,
      );
    }
    this._status = CarePlanStatus.InReview;
    this.touch();
  }

  finalize(): void {
    if (this._status !== CarePlanStatus.InReview) {
      throw new IllegalStateTransitionError(
        `レビュー中のケアプランのみ確定できます。現在: ${this._status}`,
      );
    }
    if (this._serviceItems.length === 0) {
      throw new CarePlanValidationError(
        '確定にはサービス内容が最低 1 つ必要です',
      );
    }
    const now = new Date();
    this._status = CarePlanStatus.Finalized;
    this._finalizedAt = now;
    this._updatedAt = now;
  }

  /**
   * 確定済みプランを Archived に遷移する。
   * 計画期間満了時、または後継プランが作成された際に呼ばれる。
   */
  archive(): void {
    if (this._status !== CarePlanStatus.Finalized) {
      throw new IllegalStateTransitionError(
        `Finalized 状態のケアプランのみ Archived に遷移できます。現在: ${this._status}`,
      );
    }
    this._status = CarePlanStatus.Archived;
    this._updatedAt = new Date();
  }

  // ───── ゲッター ─────
  get id(): CarePlanId { return this._id; }
  get tenantId(): TenantId { return this._tenantId; }
  get careRecipientId(): CareRecipientId { return this._careRecipientId; }
  get assessmentId(): AssessmentId { return this._assessmentId; }
  get status(): CarePlanStatus { return this._status; }
  get longTermGoals(): ReadonlyArray<LongTermGoal> { return this._longTermGoals; }
  get shortTermGoals(): ReadonlyArray<ShortTermGoal> { return this._shortTermGoals; }
  get serviceItems(): ReadonlyArray<ServiceItem> { return this._serviceItems; }
  // ... 他省略

  // ───── プライベート ─────
  private assertEditable(): void {
    if (this._status !== CarePlanStatus.Draft) {
      throw new IllegalStateTransitionError(
        `編集可能なのは Draft 状態のみです。現在: ${this._status}`,
      );
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  private static validateGoalRelations(
    longTermGoals: LongTermGoal[],
    shortTermGoals: ShortTermGoal[],
  ): void {
    const longIds = new Set(longTermGoals.map(g => g.id.value));
    for (const st of shortTermGoals) {
      if (!longIds.has(st.parentLongTermGoalId.value)) {
        throw new CarePlanValidationError(
          `短期目標の親長期目標が存在しません: ${st.parentLongTermGoalId.value}`,
        );
      }
    }
  }
}
```

### 3.4 設計判断のポイント

| ポイント | 理由 |
|---------|------|
| `private constructor` + ファクトリメソッド | 不変条件を満たさないインスタンスを作れない |
| `create` と `reconstruct` の使い分け | 新規生成（バリデーションあり）と DB 復元（バリデーションなし）を明確化 |
| ゲッターで `ReadonlyArray` を返す | 外部からの破壊的変更を型レベルで防ぐ |
| 状態遷移メソッドで例外を投げる | 「やっていい操作」を集約自身が知る |
| `tenantId` を `readonly` で保持 | マルチテナント境界を型レベルで保証 |
| `version` 加算はドメインで行わず、RPC/リポジトリで実施 | Assessment / KnowledgeDocument と方針統一 |

---

## 4. 不変条件

### 4.1 強い不変条件（集約内でトランザクショナルに守る）

| # | 不変条件 | 守る場所 |
|---|---------|---------|
| 1 | 長期目標は最低 1 つ存在する | ドメイン（create 時 + 編集時） |
| 2 | 短期目標は最低 1 つ存在する | ドメイン |
| 3 | すべての短期目標は、存在する長期目標のいずれかに紐づく | ドメイン（`validateGoalRelations`） |
| 4 | 計画期間は `from < to` | `PlanPeriod.create` + DB CHECK |
| 5 | ステータスが Finalized の場合、`finalizedAt` は null でない | ドメイン + DB CHECK |
| 6 | `tenantId` は生成後に変更できない | ドメイン（`readonly`） + DB NOT NULL |
| 7 | `assessmentId` が参照するアセスメントは Finalized 状態 | ユースケース層でチェック |

### 4.2 弱い不変条件（バリデーションで守る）

| # | 不変条件 | 守る場所 |
|---|---------|---------|
| 8 | 長期目標の期間は計画期間内に収まる | ドメイン（任意、MVP は警告） |
| 9 | サービス内容の提供頻度は妥当な値 | UI + ドメイン |

---

## 5. 状態遷移

### 5.1 状態遷移図

```
    [作成]
      │
      ▼
  ┌────────┐
  │ Draft  │ ← AI ドラフトから生成直後、編集中
  └────────┘
      │ submitForReview()
      ▼
  ┌──────────┐
  │ InReview │ ← 自己レビュー中・管理者確認中
  └──────────┘
      │ finalize()
      ▼
  ┌──────────┐
  │ Finalized│ ← 利用者・家族に説明済み、運用中
  └──────────┘
      │ archive()  ※計画期間終了 or 新プラン作成
      ▼
  ┌──────────┐
  │ Archived │ ← 終了したプラン。読み取り専用
  └──────────┘
```

### 5.2 許容される遷移

- `Draft` → `InReview` (`submitForReview`)
- `InReview` → `Finalized` (`finalize`)
- `Finalized` → `Archived` (`archive`: 計画期間終了 or 後継プラン作成)

### 5.3 禁止される遷移

- `Finalized` → `Draft`（別プランとして作り直す運用）
- `Draft` / `InReview` → `Archived`（確定前プランは Archive しない。MVP では Draft のまま残すか、別途物理削除で対応）
- `Archived` からの復帰

**理由**: 介護保険制度上、確定したケアプランは利用者・家族の同意の記録であり、気軽に書き換えられてはならない。`Finalized` 以降は新バージョンとして別プランを作る運用にすることで、監査性と業務実態に合致する。確定前の破棄シナリオは MVP では稀と判断し、状態遷移を単純化する。

### 5.4 論点: `InReview` を廃止する余地

| 観点 | 内容 |
|------|------|
| 現状 | 要件書 §4.1 で「管理者レビュー必須」は言及なし。個人作業主体 |
| 廃止案 | `Draft → Finalized → Archived` の 3 状態化。`submitForReview()` を削除 |
| 維持派の論拠 | 将来の「管理者による確認プロセス」追加時に拡張が容易 |
| 廃止派の論拠 | 使われない状態は UI を複雑にする。YAGNI |

**判断**: 実装前に運用要件（管理者レビューを業務フローに組み込むか）を再確認した上で決める。決定まで 4 状態を維持。

### 5.5 確定権限について

要件書 §4.1 のロール体系（`care_manager` / `admin`）の権能差は「管理者が招待・停止できる」のみ。ケアプラン確定は担当ケアマネ本人の業務責任（介護保険法上も利用者・家族への説明者はケアマネ）なので、ユースケース層でロール制限は行わない。テナント分離は RLS + `tenantId` 二重チェックで担保される。

---

## 6. データベース設計

### 6.1 care_plans テーブル

```sql
CREATE TABLE care_plans (
  -- 識別子
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- マルチテナント
  tenant_id               UUID NOT NULL REFERENCES tenants(id),

  -- 他集約への参照
  care_recipient_id       UUID NOT NULL REFERENCES care_recipients(id),
  assessment_id           UUID NOT NULL REFERENCES assessments(id),

  -- 業務属性
  plan_number             VARCHAR(50) NOT NULL,
  plan_period_from        DATE NOT NULL,
  plan_period_to          DATE NOT NULL,
  status                  VARCHAR(20) NOT NULL,

  -- 監査・メタ
  created_by              UUID NOT NULL REFERENCES app_users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at            TIMESTAMPTZ,

  -- 楽観的ロック
  version                 INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT care_plan_period_valid
    CHECK (plan_period_from < plan_period_to),
  CONSTRAINT care_plan_status_valid
    CHECK (status IN ('draft', 'in_review', 'finalized', 'archived')),
  -- status と finalized_at の整合:
  --   draft / in_review: finalized_at は NULL
  --   finalized / archived: finalized_at は非 NULL
  CONSTRAINT care_plan_finalized_consistency
    CHECK (
      (status IN ('draft', 'in_review') AND finalized_at IS NULL)
      OR (status IN ('finalized', 'archived') AND finalized_at IS NOT NULL)
    ),
  CONSTRAINT care_plan_number_unique_per_tenant
    UNIQUE (tenant_id, plan_number)
);

CREATE INDEX idx_care_plans_tenant_recipient
  ON care_plans(tenant_id, care_recipient_id);
CREATE INDEX idx_care_plans_tenant_status
  ON care_plans(tenant_id, status);
CREATE INDEX idx_care_plans_tenant_period
  ON care_plans(tenant_id, plan_period_from, plan_period_to);
```

### 6.2 care_plan_long_term_goals テーブル

```sql
CREATE TABLE care_plan_long_term_goals (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  care_plan_id            UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,

  sequence_no             INTEGER NOT NULL,
  title                   TEXT NOT NULL,
  description             TEXT,
  target_period_from      DATE NOT NULL,
  target_period_to        DATE NOT NULL,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT ltg_period_valid
    CHECK (target_period_from < target_period_to),
  CONSTRAINT ltg_sequence_unique
    UNIQUE (care_plan_id, sequence_no)
);

CREATE INDEX idx_ltg_tenant_plan
  ON care_plan_long_term_goals(tenant_id, care_plan_id);
```

### 6.3 care_plan_short_term_goals テーブル

```sql
CREATE TABLE care_plan_short_term_goals (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id),
  care_plan_id             UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  parent_long_term_goal_id UUID NOT NULL
    REFERENCES care_plan_long_term_goals(id) ON DELETE CASCADE,

  sequence_no              INTEGER NOT NULL,
  title                    TEXT NOT NULL,
  description              TEXT,
  target_period_from       DATE NOT NULL,
  target_period_to         DATE NOT NULL,

  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT stg_period_valid
    CHECK (target_period_from < target_period_to),
  CONSTRAINT stg_sequence_unique
    UNIQUE (care_plan_id, sequence_no)
);

CREATE INDEX idx_stg_tenant_plan
  ON care_plan_short_term_goals(tenant_id, care_plan_id);
CREATE INDEX idx_stg_parent
  ON care_plan_short_term_goals(parent_long_term_goal_id);
```

### 6.4 care_plan_service_items テーブル

```sql
CREATE TABLE care_plan_service_items (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                  UUID NOT NULL REFERENCES tenants(id),
  care_plan_id               UUID NOT NULL REFERENCES care_plans(id) ON DELETE CASCADE,
  related_short_term_goal_id UUID
    REFERENCES care_plan_short_term_goals(id) ON DELETE SET NULL,

  sequence_no                INTEGER NOT NULL,
  service_type               VARCHAR(50) NOT NULL,
  service_name               TEXT NOT NULL,
  frequency_text             TEXT,
  frequency_per_week         INTEGER,
  provider_name              TEXT,
  remarks                    TEXT,

  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT svc_sequence_unique
    UNIQUE (care_plan_id, sequence_no)
);

CREATE INDEX idx_svc_tenant_plan
  ON care_plan_service_items(tenant_id, care_plan_id);
CREATE INDEX idx_svc_type
  ON care_plan_service_items(tenant_id, service_type);
```

### 6.5 RLS 方針

```sql
ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_long_term_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_short_term_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_plans_tenant_isolation_select ON care_plans
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );

CREATE POLICY care_plans_tenant_isolation_insert ON care_plans
  FOR INSERT
  WITH CHECK (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );

CREATE POLICY care_plans_tenant_isolation_update ON care_plans
  FOR UPDATE
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );

-- 子テーブル 3 つにも同じテナント分離ポリシーを FOR ALL で適用
CREATE POLICY care_plan_ltg_tenant_isolation ON care_plan_long_term_goals
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()));

CREATE POLICY care_plan_stg_tenant_isolation ON care_plan_short_term_goals
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()));

CREATE POLICY care_plan_svc_tenant_isolation ON care_plan_service_items
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()));
```

### 6.6 設計判断

| 判断 | 理由 |
|------|------|
| 子テーブル全てに `tenant_id` を冗長に持たせる | RLS ポリシーが単純、クエリ性能が良い、テナント越境事故を防ぐ |
| `status` を VARCHAR + CHECK 制約 | ENUM だと値追加が煩雑（`ALTER TYPE` 必要）。文字列なら CHECK 変更だけ |
| `finalized_at` の整合性を CHECK 制約で担保 | ドメイン層で守る原則に加え、DB 側でも二重に守る（多層防御） |
| `version` カラムで楽観的ロック | 複数ケアマネ同時編集に備える |
| `(tenant_id, plan_number)` のユニーク制約 | テナント内で番号一意、テナント跨ぎは重複可 |
| `ON DELETE CASCADE` | 集約の生存単位が一致。MVP 後は論理削除に切り替え予定 |
| `sequence_no` カラム | 表示順序が業務上重要。`created_at` 順では順序変更できない |
| `frequency_text` と `frequency_per_week` 併存 | 自由記述（ユーザー視点）と構造化（集計用）の両立 |
| RLS はテナント分離に絞る | ロール制御までポリシーに載せるとロジックが分散し保守不能 |

---

## 7. リポジトリ層

### 7.1 設計原則

| 原則 | 内容 |
|------|------|
| ドメイン層にはインターフェースだけ | 実装はインフラ層に置き、依存方向を `infrastructure → domain` に保つ |
| リポジトリは集約単位 | 集約内部のエンティティ（長期目標等）を直接扱うリポジトリは作らない |
| 集約全体を 1 トランザクションで保存 | 集約の整合性を永続化レベルでも守る |

### 7.2 ICarePlanRepository

```typescript
// domain/care-management/care-plan/ICarePlanRepository.ts

export interface ICarePlanRepository {
  /** ID で取得（見つからない場合は null） */
  findById(id: CarePlanId, tenantId: TenantId): Promise<CarePlan | null>;

  /** 利用者に紐づくケアプラン一覧（計画期間の新しい順） */
  findByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<CarePlan[]>;

  /** 利用者の現在有効なケアプラン（Finalized かつ計画期間内） */
  findActiveByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
    today: Date,
  ): Promise<CarePlan | null>;

  /** 集約全体を 1 トランザクションで保存（新規・更新共通） */
  save(carePlan: CarePlan): Promise<void>;

  /** 後継ケアプラン作成（新規保存 + 前プランを Archived へ遷移を原子的に） */
  saveSuccessor(
    newPlan: CarePlan,
    predecessorId: CarePlanId,
  ): Promise<void>;
}
```

**インターフェース設計のポイント**

| ポイント | 理由 |
|---------|------|
| `findById` は `null` 許容 | 「存在しない」は業務上ありえる |
| `tenantId` を明示的に受け取る | 二重チェック、型レベルでテナント意識を強制 |
| `save` 一本で作成・更新両対応 | ドメインの意図は「集約を保存する」ことのみ |
| `saveSuccessor` を分離 | 2 集約を跨ぐ原子性を型レベルで表現 |
| `delete` がない | MVP では物理削除しない（状態遷移 `archive()` で論理的に無効化） |

### 7.3 Supabase 実装

```typescript
// infrastructure/repositories/SupabaseCarePlanRepository.ts

export class SupabaseCarePlanRepository implements ICarePlanRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: CarePlanId, tenantId: TenantId): Promise<CarePlan | null> {
    // 1. 親テーブル取得
    const { data: planRow, error } = await this.supabase
      .from('care_plans')
      .select('*')
      .eq('id', id.value)
      .eq('tenant_id', tenantId.value)
      .maybeSingle();

    if (error) throw new RepositoryError(error.message);
    if (!planRow) return null;

    // 2. 子テーブルを並列取得
    const [longTerms, shortTerms, services] = await Promise.all([
      this.fetchLongTermGoals(id, tenantId),
      this.fetchShortTermGoals(id, tenantId),
      this.fetchServiceItems(id, tenantId),
    ]);

    // 3. マッパーでドメイン復元
    return CarePlanMapper.toDomain({
      plan: planRow,
      longTermGoals: longTerms,
      shortTermGoals: shortTerms,
      serviceItems: services,
    });
  }

  async save(carePlan: CarePlan): Promise<void> {
    const payload = CarePlanMapper.toPersistence(carePlan);

    const { error } = await this.supabase.rpc('save_care_plan', {
      p_payload: payload,
    });

    if (error) {
      if (error.message.includes('version_conflict')) {
        throw new OptimisticLockError(
          '他のユーザーが同時に更新しました。画面を再読み込みしてください。',
        );
      }
      throw new RepositoryError(error.message);
    }
  }

  async saveSuccessor(newPlan: CarePlan, predecessorId: CarePlanId): Promise<void> {
    const payload = CarePlanMapper.toPersistence(newPlan);

    const { error } = await this.supabase.rpc('create_successor_care_plan', {
      p_new_plan: payload,
      p_predecessor_id: predecessorId.value,
    });

    if (error) {
      if (error.message.includes('predecessor_not_finalized')) {
        throw new UseCaseError(
          'INVALID_INPUT',
          '後継プランは確定済みプランに対してのみ作成できます',
        );
      }
      throw new RepositoryError(error.message);
    }
  }

  // ... fetchLongTermGoals / fetchShortTermGoals / fetchServiceItems は省略
}
```

### 7.4 マッパー

```typescript
// infrastructure/repositories/mappers/CarePlanMapper.ts

export class CarePlanMapper {
  /** DB 行 → ドメインモデル（復元） */
  static toDomain(rows: {
    plan: CarePlanRow;
    longTermGoals: LongTermGoalRow[];
    shortTermGoals: ShortTermGoalRow[];
    serviceItems: ServiceItemRow[];
  }): CarePlan {
    const longTerms = rows.longTermGoals
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map(r => LongTermGoal.reconstruct({ /* ... */ }));

    // shortTerms, services も同様

    return CarePlan.reconstruct({
      id: new CarePlanId(rows.plan.id),
      tenantId: new TenantId(rows.plan.tenant_id),
      // ... 全フィールド
    });
  }

  /** ドメインモデル → DB 保存用ペイロード */
  static toPersistence(carePlan: CarePlan): CarePlanPersistencePayload {
    return {
      plan: { /* ... */ },
      long_term_goals: carePlan.longTermGoals.map(g => ({
        id: g.id.value,                // ← 子エンティティ ID を必ず含める（§7.5）
        sequence_no: g.sequenceNo,
        title: g.title,
        description: g.description,
        target_period_from: g.targetPeriod.from.toISOString(),
        target_period_to: g.targetPeriod.to.toISOString(),
      })),
      short_term_goals: carePlan.shortTermGoals.map(g => ({
        id: g.id.value,
        parent_long_term_goal_id: g.parentLongTermGoalId.value,
        // ...
      })),
      service_items: carePlan.serviceItems.map(s => ({
        id: s.id.value,
        // ...
      })),
    };
  }
}
```

**子エンティティ ID の永続性契約**:
`save_care_plan` RPC は子テーブルを「全削除 → 再挿入」する（§7.5）。このとき DB が新しい UUID を振ると、次回取得時に ID が変わり、外部からの参照（`removeShortTermGoal(id)` 等）が壊れる。これを避けるため、`CarePlanMapper.toPersistence` は**ドメインが保持している子エンティティの `id.value` を必ずペイロードに含め、RPC は受け取った ID で INSERT する**契約とする（アセスメントの `AssessmentIssue` も同様、`assessment-aggregate-design.md §7.4` 参照）。

### 7.5 save_care_plan RPC（永続化トランザクション）

集約保存は 4 テーブルへの書き込みを伴うため、**PostgreSQL 関数（RPC）で 1 トランザクション化**する。

```sql
CREATE OR REPLACE FUNCTION save_care_plan(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER  -- RLS を有効にする
AS $$
DECLARE
  v_plan_id UUID;
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_plan JSONB;
BEGIN
  v_plan := p_payload->'plan';
  v_plan_id := (v_plan->>'id')::UUID;
  v_new_version := (v_plan->>'version')::INTEGER;

  SELECT version INTO v_current_version
  FROM care_plans WHERE id = v_plan_id;

  IF v_current_version IS NULL THEN
    -- 新規 INSERT
    INSERT INTO care_plans (...) VALUES (...);
  ELSE
    -- 楽観的ロックチェック
    IF v_current_version != v_new_version THEN
      RAISE EXCEPTION 'version_conflict: expected %, got %',
        v_current_version, v_new_version;
    END IF;
    UPDATE care_plans SET ..., version = version + 1 WHERE id = v_plan_id;
  END IF;

  -- 子テーブルは全削除→再挿入戦略（§7.4 の子 ID 永続性契約により同一 ID が再挿入される）
  DELETE FROM care_plan_service_items WHERE care_plan_id = v_plan_id;
  DELETE FROM care_plan_short_term_goals WHERE care_plan_id = v_plan_id;
  DELETE FROM care_plan_long_term_goals WHERE care_plan_id = v_plan_id;

  INSERT INTO care_plan_long_term_goals (...)
  SELECT ... FROM jsonb_array_elements(p_payload->'long_term_goals');
  -- 同様に short_term_goals, service_items
END;
$$;
```

**「全削除→再挿入」戦略を選んだ理由**

| 戦略 | メリット | デメリット |
|------|---------|----------|
| 差分更新（追加・更新・削除を個別に） | 更新行数が少ない | 実装が複雑、データ不整合リスク |
| 全削除→再挿入 ✅ | 実装シンプル、集約整合性が確実 | 行数が多いと遅い |

ケアプラン 1 つあたりの子レコードは数十件程度のため、パフォーマンス影響は無視できる。

### 7.6 create_successor_care_plan RPC（後継プラン作成）

`CreateSuccessorCarePlanUseCase`（§8.4）は **新プラン作成**と**前プランの `Archived` 遷移**を原子的に行う必要がある。`save_care_plan`（§7.5）は 1 集約のみ対象なので、専用 RPC を追加する。

```sql
CREATE OR REPLACE FUNCTION create_successor_care_plan(
  p_new_plan       JSONB,
  p_predecessor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_predecessor_version INTEGER;
BEGIN
  -- 1. 前プランが Finalized 状態であることを確認（RLS 経由でテナント越境防止）
  SELECT version INTO v_predecessor_version
  FROM care_plans
  WHERE id = p_predecessor_id AND status = 'finalized';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'predecessor_not_finalized: id=%', p_predecessor_id;
  END IF;

  -- 2. 前プランを Archived に遷移
  UPDATE care_plans
  SET status     = 'archived',
      updated_at = NOW(),
      version    = version + 1
  WHERE id = p_predecessor_id;

  -- 3. 新プランを INSERT（save_care_plan の新規 INSERT ロジックと同じ構造）
  INSERT INTO care_plans (
    id, tenant_id, care_recipient_id, assessment_id, plan_number,
    plan_period_from, plan_period_to, status,
    created_by, created_at, updated_at, version
  ) VALUES (
    (p_new_plan->'plan'->>'id')::UUID,
    (p_new_plan->'plan'->>'tenant_id')::UUID,
    (p_new_plan->'plan'->>'care_recipient_id')::UUID,
    (p_new_plan->'plan'->>'assessment_id')::UUID,
    p_new_plan->'plan'->>'plan_number',
    (p_new_plan->'plan'->>'plan_period_from')::DATE,
    (p_new_plan->'plan'->>'plan_period_to')::DATE,
    'draft',
    (p_new_plan->'plan'->>'created_by')::UUID,
    NOW(), NOW(), 1
  );

  -- 4. 子テーブル INSERT
  INSERT INTO care_plan_long_term_goals (
    id, tenant_id, care_plan_id, sequence_no, title, description,
    target_period_from, target_period_to, created_at, updated_at
  )
  SELECT
    (g->>'id')::UUID,
    (p_new_plan->'plan'->>'tenant_id')::UUID,
    (p_new_plan->'plan'->>'id')::UUID,
    (g->>'sequence_no')::INTEGER,
    g->>'title', g->>'description',
    (g->>'target_period_from')::DATE,
    (g->>'target_period_to')::DATE,
    NOW(), NOW()
  FROM jsonb_array_elements(p_new_plan->'long_term_goals') AS g;

  -- short_term_goals, service_items も同様
END;
$$;
```

---

## 8. ユースケース層との接続

### 8.1 ケアプラン作成フロー全体

```
[1] 利用者選択
       ↓
[2] 音声入力 → 文字起こし → マスキング準備
       ↓ PrepareAssessmentDraftUseCase           (PII マスキング 1/2)
[3] 人手確認ゲート(マスキング内容を承認)
       ↓ GenerateAssessmentFromMaskedTextUseCase (PII マスキング 2/2 + 集約生成)
[4] アセスメント生成・編集 (Draft)
       ↓ FinalizeAssessmentUseCase
[5] アセスメント確定 (Finalized)
       ↓ GenerateCarePlanDraftUseCase
[6] AI ケアプランドラフト生成
       ↓ CreateCarePlanFromDraftUseCase
[7] ケアプラン保存 (Draft 状態)
       ↓ UpdateCarePlanUseCase
[8] サービス内容追加・編集
       ↓ SubmitCarePlanForReviewUseCase
[9] レビュー依頼 (InReview)
       ↓ FinalizeCarePlanUseCase
[10] 確定 (Finalized)
       ↓ (後続プラン作成時) CreateSuccessorCarePlanUseCase → 前プランを archive()
[11] Archived
```

**フロー設計上の注意**: [5] アセスメント確定は [6] ドラフト生成の前提条件。`GenerateCarePlanDraftUseCase` は `Finalized` アセスメントのみ受け付ける（`assessment-aggregate-design.md §5.3`）。UI 上、[4]→[5] の間に明示的な「アセスメント確定」ボタンを置く。

**ステップごとにユースケースを分ける理由**
- ユーザーは途中で中断する（例: [5] でドラフトだけ作って後日続き）
- 各ステップが独立した「業務的な完了」を持つ
- 失敗時のリトライ単位が明確になる
- テストしやすい

### 8.2 FinalizeCarePlanUseCase（状態遷移ユースケースの例）

```typescript
// application/care-management/care-plan/FinalizeCarePlanUseCase.ts

export class FinalizeCarePlanUseCase
  implements IUseCase<FinalizeCarePlanInput, void> {

  constructor(private readonly carePlanRepo: ICarePlanRepository) {}

  async execute(input: FinalizeCarePlanInput): Promise<void> {
    const tenantId = new TenantId(input.auth.tenantId);

    const carePlan = await this.carePlanRepo.findById(
      new CarePlanId(input.carePlanId),
      tenantId,
    );
    if (!carePlan) {
      throw new UseCaseError('NOT_FOUND', 'ケアプランが見つかりません');
    }

    carePlan.finalize();  // ドメインが不変条件を守る
    await this.carePlanRepo.save(carePlan);
  }
}
```

**この薄さこそが DDD の理想形**: 業務ルール（「InReview 状態のみ確定可能」「サービス内容が必要」等）はすべてドメイン層 `CarePlan.finalize()` に集約され、ユースケースは「取得・呼び出し・保存」の調整役に徹する。

### 8.3 GenerateCarePlanDraftUseCase との関係

ケアプランドラフト生成ユースケースは **ケアプラン集約を生成しない** — Gemini の生成結果をそのまま画面に返す「中間結果」として扱う（`ai_generation_logs` のみ記録）。ケアマネが採用した時点で `CreateCarePlanFromDraftUseCase` が集約を生成・保存する。

RAG 連携の詳細とマスキング再処理については以下を参照:
- `care-manager-ai-design.md §7.7` ← `GenerateCarePlanDraftUseCase` 本体
- `ai-support-context-design.md §3.4 §4.3` ← プロンプト・スキーマ
- `knowledge-context-design.md §7.3` ← RAG 結果の再マスキング

### 8.4 CreateSuccessorCarePlanUseCase

月次見直しで新ケアプランを作成する際、前プランを `Archived` に遷移させる 2 集約原子操作を担う。

```typescript
// application/care-management/care-plan/CreateSuccessorCarePlanUseCase.ts

async execute(input: CreateSuccessorCarePlanInput): Promise<void> {
  // 1. 前プラン取得・Finalized 確認
  const predecessor = await this.carePlanRepo.findById(...);
  if (!predecessor || predecessor.status !== CarePlanStatus.Finalized) {
    throw new UseCaseError(
      'INVALID_INPUT',
      '後継プランは確定済みプランに対してのみ作成できます',
    );
  }

  // 2. 新プランを Draft 状態で組み立て（CarePlan.create()）
  const newPlan = CarePlan.create({ ... });

  // 3. create_successor_care_plan RPC で 1 トランザクション実行
  await this.carePlanRepo.saveSuccessor(newPlan, predecessor.id);
}
```

### 8.5 ケアプランのバージョニング方針

**確定方針: 新ケアプランとして作成する（月次見直しは新レコード）**

| 選択肢 | 採否 | 理由 |
|-------|------|------|
| 同一レコードを上書き | ❌ | 過去の計画内容が失われ、監査・経緯確認ができない |
| `version` カラムで履歴管理 | ❌ | 集約肥大化、クエリ複雑化 |
| 計画期間ごとに別レコード（採用） | ✅ | 計画期間が業務上の境界。レコード 1 行 = 1 計画 |

**運用ルール**:
- `care_plans.plan_period_from` / `plan_period_to` が計画期間を表現し、利用者ごとに時系列で複数行が並ぶ
- 新プラン作成時、前プランを `archive()` で `Archived` に遷移させる（`CreateSuccessorCarePlanUseCase` がトランザクション内で実行）
- 「現時点で有効なケアプラン」は `findActiveByRecipient(recipientId, today)` で取得可能（§7.2）
- `care_plans.plan_number` にバージョン番号を含めるかは UI 要件次第（例: `CP-2026-04-01-v2`）

**不変条件**:
- 同一利用者で `Finalized` 状態の計画期間が重複してはならない（ユースケース層でチェック）
- 計画期間は過去のアセスメントを参照してもよいが、`Finalized` アセスメントに限る

---

## 9. テスト方針

### 9.1 ドメイン層単体テスト（必須）

```typescript
describe('CarePlan', () => {
  describe('create', () => {
    it('長期目標が 0 件だと作成できない', () => {
      expect(() => CarePlan.create({ /* longTermGoals: [] */ }))
        .toThrow(CarePlanValidationError);
    });

    it('短期目標の親が存在しないと作成できない', () => {
      expect(() => CarePlan.create({
        /* 親 ID が不整合な shortTermGoals */
      })).toThrow(CarePlanValidationError);
    });
  });

  describe('状態遷移', () => {
    it('Draft → InReview → Finalized が可能', () => {
      const plan = CarePlan.create({ /* ... */ });
      plan.submitForReview();
      expect(plan.status).toBe(CarePlanStatus.InReview);
      // サービス内容追加後 finalize 可能
    });

    it('Draft から直接 Finalized は不可', () => {
      const plan = CarePlan.create({ /* ... */ });
      expect(() => plan.finalize()).toThrow(IllegalStateTransitionError);
    });

    it('Finalized → Archived のみ可能', () => {
      // ...
    });

    it('Archived からの復帰不可', () => {
      // ...
    });
  });

  describe('finalize', () => {
    it('サービス内容が 0 件だと確定できない', () => {
      const plan = /* InReview 状態でサービスなし */;
      expect(() => plan.finalize()).toThrow(CarePlanValidationError);
    });
  });
});
```

### 9.2 統合テスト

- `SupabaseCarePlanRepository.save` → `findById` で復元したオブジェクトが等価
- `save_care_plan` RPC の楽観的ロック競合（`version_conflict` 例外）
- `create_successor_care_plan` RPC のトランザクション整合性（前プラン Archive + 新プラン INSERT）
- RLS: 別テナントのケアプランが取得できない

---

## 10. MVP 優先度マトリクス

### 10.1 ドメイン層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `CarePlan` 集約ルート + ファクトリ + 不変条件 |
| 🔴 必須 | 子エンティティ（`LongTermGoal` / `ShortTermGoal` / `ServiceItem`） |
| 🔴 必須 | `PlanPeriod` / `CarePlanStatus` 値オブジェクト・列挙型 |
| 🔴 必須 | 状態遷移メソッド（`submitForReview` / `finalize` / `archive`） |
| 🟡 推奨 | `ICarePlanRepository.findActiveByRecipient` |
| 🟢 後回し | ドメインイベント（`CarePlanFinalized` 等） |

### 10.2 DB スキーマ

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `care_plans` + 子テーブル 3 つ |
| 🔴 必須 | CHECK 制約（status, period, finalized_consistency） |
| 🔴 必須 | RLS によるテナント分離（§6.5） |
| 🟡 推奨 | `version` カラムによる楽観的ロック |
| 🟡 推奨 | `save_care_plan` / `create_successor_care_plan` RPC |
| 🟢 後回し | 論理削除（`deleted_at`） |

### 10.3 リポジトリ層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `ICarePlanRepository` インターフェース |
| 🔴 必須 | `SupabaseCarePlanRepository` 実装 |
| 🔴 必須 | `CarePlanMapper`（子エンティティ ID 永続性契約含む） |
| 🔴 必須 | RPC 関数 `save_care_plan` / `create_successor_care_plan` |

### 10.4 ユースケース層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `CreateCarePlanFromDraftUseCase` |
| 🔴 必須 | `UpdateCarePlanUseCase` |
| 🔴 必須 | `SubmitCarePlanForReviewUseCase`（`InReview` 維持の場合） |
| 🔴 必須 | `FinalizeCarePlanUseCase` |
| 🔴 必須 | `CreateSuccessorCarePlanUseCase` |
| 🟡 推奨 | ユースケース単体テスト |

---

## 11. 未決定事項・今後の論点

| 論点 | 内容 |
|------|------|
| `InReview` 状態の要否 | 要件書 §4.1 には管理者レビュー必須の記述なし。**実装前にユーザーと再確認**、不要なら 3 状態に単純化 |
| 計画期間重複チェックの実装位置 | MVP はユースケース層。複雑化したらドメインサービス化 |
| モニタリング機能との連動 | MVP スコープ外。`Archived` 状態プランに対するモニタリング結果を別集約で紐付ける想定 |
| 論理削除への移行 | MVP は物理削除なし（`archive()` で代用）。運用後、削除要望があれば `deleted_at` 追加 |
| プランナンバリング規則 | UI 要件次第。例: `CP-YYYY-MM-DD-vN` |

---

## 付録 A: 業務用語集

業務用語の定義は **要件定義書 `ai_care_mg.md` §8** を正とする。

このドキュメント固有の補足:

| 用語 | 補足（設計文脈） |
|------|----------------|
| 長期目標 | 計画期間全体（6〜12 ヶ月）で達成を目指す目標。`LongTermGoal` 子エンティティ |
| 短期目標 | 長期目標の達成に向けた中間目標（3〜6 ヶ月）。必ず親長期目標を持つ |
| サービス内容 | 短期目標達成のためのサービス提供計画。`ServiceItem` 子エンティティ |
| 後継プラン | 月次見直しで作成される新計画期間のケアプラン。前プランは `Archived` に遷移 |

---

## 付録 B: アセスメント集約との整合確認チェックリスト

ケアプラン集約からアセスメント集約を参照する際の制約:

- [x] `tenantId` が一致すること（両方が同じテナント） → RLS で担保
- [x] アセスメントが Finalized 状態であること → ユースケース層でチェック
- [x] アセスメントが論理削除されていないこと → MVP は物理/論理削除しない方針のため自動的に満たされる
- [x] アセスメントの `careRecipientId` がケアプランの `careRecipientId` と一致すること → ユースケース層でチェック

---

**ドキュメントバージョン**: 0.1（分離時点）
**最終更新**: 2026-04-24
**0.1 の主な変更点**:
- `care-manager-ai-design.md §4〜§7` のうちケアプラン集約に固有な内容を独立ドキュメント化
- アセスメント集約（`assessment-aggregate-design.md`）と対称な構造に再編
- 親ドキュメントには境界づけられたコンテキスト・コンテキスト間連携・ユースケース共通原則・認証/Supabase 使い分けなど「全体設計」を残す
