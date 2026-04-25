# ケアマネジメントコンテキスト: アセスメント集約 詳細設計ドキュメント

> 本ドキュメントは `care-manager-ai-design.md` の「10.1 ドメイン側の未決定事項」に挙げられた
> 「アセスメント集約の詳細設計(属性・課題分類体系・状態遷移)」を詳細化したもの。
> ケアプラン集約と並ぶ中核として、同レベルの詳細度で設計する。

**ドキュメントバージョン**: 0.2 (実装前レビュー反映版)
**最終更新**: 2026-04-23
**親ドキュメント**: `care-manager-ai-design.md`
**関連ドキュメント**: `pii-masking-design.md`

---

## 1. 背景と方針

### 1.1 親ドキュメントでの位置づけ

ケアマネジメントコンテキスト内の3つの集約のうち、ケアプラン集約に次ぐ中核。
利用者の状態を把握しケアプランの根拠となる「アセスメント記録」を表現する。

### 1.2 確定した設計判断(意思決定の記録)

| 項目 | 採用方針 | 決定理由 |
|------|---------|---------|
| 保持情報の粒度 | **課題・ニーズのみ**(音声要約から抽出) | MVP最小スコープ。ケアプランドラフト生成に必要十分 |
| アセスメント種別 | **初回 / 再アセスメントの2種類** | 業務上の意味的区別が明確。Enum 2値で実装も簡素 |
| モニタリングの扱い | **集約外**(将来別集約として設計) | 業務的にモニタリングは「目標達成評価」が中核で、アセスメントとは関心事が異なる |
| 状態遷移 | **Draft → Finalized の2状態** | ケアプランより業務的に軽量。InReview フェーズは個人作業のため不要 |
| マスキング情報の保持 | **集約に `placeholderMap` を含める** | アンマスクが画面表示時に必要なため、集約から離せない |

### 1.3 採用しなかった選択肢の記録

| 選択肢 | 採用しなかった理由 |
|--------|------------------|
| カテゴリ別詳細(ADL/IADL/認知/健康など)を集約に保持 | MVP では過剰。AI 要約結果にカテゴリ分類されたものを `IssueCategory` で表現すれば十分 |
| 課題分析23項目を厳密に保持 | UI 入力負担が大きく MVP に不適。介護ソフト連携時に再検討 |
| アセスメントにモニタリング機能を含める | 関心事が異なる。業務的に「課題・ニーズのみ」では「目標達成評価」が表現できない |
| 3状態(Draft → InReview → Finalized) | アセスメントは個人作業。レビューフェーズは過剰 |
| 状態遷移なし | 「いつ確定したか」が曖昧になり、ケアプランからの参照タイミングが不明確 |

---

## 2. 集約境界

### 2.1 集約構造図

```
┌───────────────────────────────────┐
│ 【集約】アセスメント                 │
│  Root: Assessment                 │
│  ├ type (初回/再)                  │
│  ├ issues: AssessmentIssue[]      │
│  ├ sourceTranscript (原文)         │
│  ├ maskedSummary (マスク済み要約)   │
│  ├ placeholderMap (アンマスク辞書)  │
│  ├ status (Draft/Finalized)       │
│  └ conductedAt (実施日)           │
└───────────────────────────────────┘
        │ ID参照
        ▼
┌───────────────────────────────────┐
│ 【集約】利用者                      │
│  Root: CareRecipient              │
└───────────────────────────────────┘

【集約外参照】
  - careRecipientId: CareRecipientId
  - createdBy: UserId
```

### 2.2 ケアプラン集約との関係

```
┌─────────────────────┐         ┌──────────────────────┐
│ 集約: ケアプラン      │ ──ID──▶ │ 集約: アセスメント     │
│                     │  参照   │                      │
│ assessmentId        │         │ 必ず Finalized 状態    │
└─────────────────────┘         └──────────────────────┘
```

ケアプランは Finalized 状態のアセスメントのみ参照可能(整合性制約)。

---

## 3. ドメインモデル設計

### 3.1 値オブジェクト・列挙型

```typescript
// domain/care-management/assessment/AssessmentType.ts

export enum AssessmentType {
  Initial = 'initial',           // 初回アセスメント
  Reassessment = 'reassessment', // 再アセスメント
}

// domain/care-management/assessment/AssessmentStatus.ts

export enum AssessmentStatus {
  Draft = 'draft',
  Finalized = 'finalized',
}

// domain/care-management/assessment/IssueCategory.ts

export type IssueCategory =
  | 'health'        // 健康・医療
  | 'adl'           // ADL(食事・排泄・入浴・移動)
  | 'iadl'          // IADL(買い物・調理・金銭管理)
  | 'cognitive'     // 認知機能
  | 'social'        // 社会参加・対人関係
  | 'family'        // 家族・介護環境
  | 'other';        // その他

export type IssuePriority = 'high' | 'medium' | 'low';
```

### 3.2 値オブジェクト: PlaceholderMapSnapshot

PIIマスキング設計との整合性のため、アンマスクに必要な最小情報を集約に保持する値オブジェクト。
`MaskingResult`(ユースケース層の概念)とは分離する。

```typescript
// domain/care-management/assessment/PlaceholderMapSnapshot.ts

export class PlaceholderMapSnapshot {
  private constructor(
    private readonly entries: ReadonlyArray<{
      token: string;
      originalValue: string;
      category: string;  // PiiCategory の文字列値
    }>,
  ) {}

  static create(entries: Array<{
    token: string;
    originalValue: string;
    category: string;
  }>): PlaceholderMapSnapshot {
    return new PlaceholderMapSnapshot(entries);
  }

  /** 画面表示用にアンマスクする */
  unmask(textWithPlaceholders: string): string {
    let result = textWithPlaceholders;
    for (const entry of this.entries) {
      result = result.replaceAll(entry.token, entry.originalValue);
    }
    return result;
  }

  /** プレースホルダ件数(統計用) */
  get count(): number {
    return this.entries.length;
  }

  toJSON() {
    return this.entries;
  }
}
```

### 3.3 子エンティティ: AssessmentIssue

```typescript
// domain/care-management/assessment/AssessmentIssue.ts

export class AssessmentIssue {
  private constructor(
    public readonly id: AssessmentIssueId,
    private _category: IssueCategory,
    private _description: string,         // マスク済みのテキスト
    private _priority: IssuePriority,
    private _sequenceNo: number,
  ) {}

  static create(params: {
    category: IssueCategory;
    description: string;
    priority: IssuePriority;
    sequenceNo: number;
  }): AssessmentIssue {
    if (params.description.trim().length === 0) {
      throw new AssessmentValidationError('課題の説明は空にできません');
    }
    return new AssessmentIssue(
      AssessmentIssueId.generate(),
      params.category,
      params.description,
      params.priority,
      params.sequenceNo,
    );
  }

  static reconstruct(params: {
    id: AssessmentIssueId;
    category: IssueCategory;
    description: string;
    priority: IssuePriority;
    sequenceNo: number;
  }): AssessmentIssue {
    return new AssessmentIssue(
      params.id,
      params.category,
      params.description,
      params.priority,
      params.sequenceNo,
    );
  }

  updateDescription(newDescription: string): void {
    if (newDescription.trim().length === 0) {
      throw new AssessmentValidationError('課題の説明は空にできません');
    }
    this._description = newDescription;
  }

  updateCategory(category: IssueCategory): void {
    this._category = category;
  }

  updatePriority(priority: IssuePriority): void {
    this._priority = priority;
  }

  get category(): IssueCategory { return this._category; }
  get description(): string { return this._description; }
  get priority(): IssuePriority { return this._priority; }
  get sequenceNo(): number { return this._sequenceNo; }
}
```

### 3.4 集約ルート: Assessment

```typescript
// domain/care-management/assessment/Assessment.ts
// ※ フレームワーク非依存、純粋な TypeScript

export class Assessment {
  private constructor(
    private readonly _id: AssessmentId,
    private readonly _tenantId: TenantId,
    private readonly _careRecipientId: CareRecipientId,
    private readonly _type: AssessmentType,
    private _issues: AssessmentIssue[],
    private readonly _sourceTranscript: string,
    private readonly _maskedSummary: string,
    private readonly _placeholderMap: PlaceholderMapSnapshot,
    private _status: AssessmentStatus,
    private readonly _conductedAt: Date,
    private readonly _createdBy: UserId,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private _finalizedAt: Date | null,
    private _version: number,
  ) {}

  // ───── ファクトリメソッド ─────

  /** 新規アセスメント作成(不変条件チェックあり) */
  static create(params: {
    tenantId: TenantId;
    careRecipientId: CareRecipientId;
    type: AssessmentType;
    issues: AssessmentIssue[];
    sourceTranscript: string;
    maskedSummary: string;
    placeholderMap: PlaceholderMapSnapshot;
    conductedAt: Date;
    createdBy: UserId;
  }): Assessment {
    if (params.issues.length === 0) {
      throw new AssessmentValidationError('課題は最低1件必要です');
    }
    if (params.sourceTranscript.trim().length === 0) {
      throw new AssessmentValidationError('音声原文は空にできません');
    }
    if (params.maskedSummary.trim().length === 0) {
      throw new AssessmentValidationError('要約は空にできません');
    }
    Assessment.validateIssueSequences(params.issues);

    const now = new Date();
    return new Assessment(
      AssessmentId.generate(),
      params.tenantId,
      params.careRecipientId,
      params.type,
      params.issues,
      params.sourceTranscript,
      params.maskedSummary,
      params.placeholderMap,
      AssessmentStatus.Draft,
      params.conductedAt,
      params.createdBy,
      now,
      now,
      null,
      1,
    );
  }

  /** リポジトリから復元(バリデーションなし) */
  static reconstruct(params: { /* 全フィールド */ }): Assessment {
    return new Assessment(/* ... */);
  }

  // ───── ドメインロジック ─────

  /** 課題を追加 */
  addIssue(issue: AssessmentIssue): void {
    this.assertEditable();
    if (this._issues.some(i => i.sequenceNo === issue.sequenceNo)) {
      throw new AssessmentValidationError(
        `sequence_no ${issue.sequenceNo} は既に使われています`,
      );
    }
    this._issues.push(issue);
    this.touch();
  }

  /** 課題を削除 */
  removeIssue(issueId: AssessmentIssueId): void {
    this.assertEditable();
    if (this._issues.length === 1) {
      throw new AssessmentValidationError(
        '課題は最低1件残す必要があります',
      );
    }
    this._issues = this._issues.filter(i => !i.id.equals(issueId));
    this.touch();
  }

  /** 課題を更新(コールバックパターン) */
  updateIssue(
    issueId: AssessmentIssueId,
    updater: (issue: AssessmentIssue) => void,
  ): void {
    this.assertEditable();
    const issue = this._issues.find(i => i.id.equals(issueId));
    if (!issue) {
      throw new AssessmentValidationError('課題が見つかりません');
    }
    updater(issue);
    this.touch();
  }

  /** 確定 */
  finalize(): void {
    if (this._status !== AssessmentStatus.Draft) {
      throw new IllegalStateTransitionError(
        `Draft 状態のアセスメントのみ確定できます。現在: ${this._status}`,
      );
    }
    if (this._issues.length === 0) {
      throw new AssessmentValidationError(
        '確定には課題が最低1件必要です',
      );
    }
    const now = new Date();
    this._status = AssessmentStatus.Finalized;
    this._finalizedAt = now;
    this._updatedAt = now;
  }

  /** アンマスク済みの要約を取得(画面表示用) */
  getUnmaskedSummary(): string {
    return this._placeholderMap.unmask(this._maskedSummary);
  }

  /** アンマスク済みの課題説明を取得(画面表示用) */
  getUnmaskedIssueDescription(issueId: AssessmentIssueId): string {
    const issue = this._issues.find(i => i.id.equals(issueId));
    if (!issue) {
      throw new AssessmentValidationError('課題が見つかりません');
    }
    return this._placeholderMap.unmask(issue.description);
  }

  // ───── ゲッター(読み取り専用) ─────
  get id(): AssessmentId { return this._id; }
  get tenantId(): TenantId { return this._tenantId; }
  get careRecipientId(): CareRecipientId { return this._careRecipientId; }
  get type(): AssessmentType { return this._type; }
  get status(): AssessmentStatus { return this._status; }
  get issues(): ReadonlyArray<AssessmentIssue> { return this._issues; }
  get sourceTranscript(): string { return this._sourceTranscript; }
  get maskedSummary(): string { return this._maskedSummary; }
  get conductedAt(): Date { return this._conductedAt; }
  get createdBy(): UserId { return this._createdBy; }
  get createdAt(): Date { return this._createdAt; }
  get updatedAt(): Date { return this._updatedAt; }
  get finalizedAt(): Date | null { return this._finalizedAt; }
  get version(): number { return this._version; }

  // ───── プライベート ─────
  private assertEditable(): void {
    if (this._status !== AssessmentStatus.Draft) {
      throw new IllegalStateTransitionError(
        `編集可能なのは Draft 状態のみです。現在: ${this._status}`,
      );
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  private static validateIssueSequences(issues: AssessmentIssue[]): void {
    const seqs = issues.map(i => i.sequenceNo);
    if (new Set(seqs).size !== seqs.length) {
      throw new AssessmentValidationError('課題の sequence_no が重複しています');
    }
  }
}
```

### 3.5 設計判断のポイント

| ポイント | 理由 |
|---------|------|
| `private constructor` + ファクトリメソッド | 不変条件を満たさないインスタンスを作れないようにする |
| `create` と `reconstruct` の使い分け | 新規生成(バリデーションあり)と DB 復元(バリデーションなし)を明確化 |
| `placeholderMap` を集約に含める | アンマスクが画面表示時に必要、集約と切り離せない情報 |
| `getUnmaskedSummary` をドメイン層に置く | アンマスク**能力**はドメインに、**呼び出し判断**はユースケース層に |
| `updateIssue` をコールバック方式 | エンティティ内部の変更を集約ルート経由で制御、不変条件を守る |
| ゲッターで `ReadonlyArray` を返す | 外部からの破壊的変更を型レベルで防ぐ |
| `tenantId` を `readonly` で保持 | マルチテナント境界を型レベルで保証 |

---

## 4. 不変条件

### 4.1 強い不変条件(集約内でトランザクショナルに守る)

| # | 不変条件 | 守る場所 |
|---|---------|---------|
| 1 | 課題は最低1件存在する | ドメイン(create時 + finalize時 + removeIssue時) |
| 2 | sourceTranscript は空にできない | ドメイン(create時) |
| 3 | maskedSummary は空にできない | ドメイン(create時) |
| 4 | sequence_no は集約内で重複しない | ドメイン(create + addIssue) + DB(UNIQUE制約) |
| 5 | Finalized → Draft への戻りは禁止 | ドメイン(状態遷移メソッド) |
| 6 | Finalized 状態で finalizedAt は非null | ドメイン + DB(CHECK制約) |
| 7 | tenantId は変更不可 | ドメイン(`readonly`) + DB(NOT NULL) |
| 8 | Draft 状態のみ編集可能 | ドメイン(`assertEditable`) |

### 4.2 弱い不変条件(バリデーションで守る)

| # | 不変条件 | 守る場所 |
|---|---------|---------|
| 9 | 課題の description は空白のみではない | ドメイン(AssessmentIssue.create / updateDescription) |
| 10 | conductedAt は未来日付ではない | ユースケース層(業務的に厳密でなくてもよい) |

---

## 5. 状態遷移

### 5.1 状態遷移図

```
    [作成]
      │
      ▼
  ┌────────┐
  │ Draft  │ ← AI要約から生成直後、編集中
  └────────┘
      │ finalize()
      ▼
  ┌──────────┐
  │ Finalized│ ← ケアプランの根拠として確定
  └──────────┘
```

### 5.2 禁止される遷移

- `Finalized` → `Draft`(再開不可。新しいアセスメントとして作成する)
- `Finalized` 後の課題編集

**理由**: アセスメントが Finalized されると、それを参照するケアプランの根拠となる。
後から書き換えると、ケアプランの根拠が変わってしまい、業務的・監査的に問題が生じる。
状態変化があれば「再アセスメント」として新規作成する運用にする。

### 5.3 ケアプランとの整合制約

ケアプラン作成時、参照する `assessmentId` のアセスメントは **Finalized でなければならない**。
この制約は **ユースケース層**(`GenerateCarePlanDraftUseCase` / `CreateCarePlanFromDraftUseCase`)でチェックする。

**UI/ユースケースの接続順序(M1)**:

```
[AI 要約] → GenerateAssessmentFromMaskedTextUseCase → (Draft 状態)
  → 画面で課題・要約を編集
  → FinalizeAssessmentUseCase (明示的な「アセスメント確定」ボタン)
  → (Finalized 状態)
  → GenerateCarePlanDraftUseCase (ここで初めてドラフト生成可能)
```

`care-manager-ai-design.md` §7.3 のフロー [4]→[5] のステップがこれに対応する。画面フローの中に「アセスメント確定」のアクションを必ず挟むこと。

```typescript
// 例: ケアプラン作成ユースケース内
const assessment = await assessmentRepo.findById(input.assessmentId, tenantId);
if (!assessment) {
  throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');
}
if (assessment.status !== AssessmentStatus.Finalized) {
  throw new UseCaseError(
    'INVALID_INPUT',
    'ケアプランは Finalized 状態のアセスメントのみ参照できます',
  );
}
```

将来複雑化したら **ドメインサービス**(`CarePlanCreationDomainService`)に昇格を検討。

---

## 6. データベース設計

### 6.1 assessments テーブル

```sql
CREATE TABLE assessments (
  -- 識別子
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- マルチテナント
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  
  -- 他集約への参照
  care_recipient_id       UUID NOT NULL REFERENCES care_recipients(id),
  
  -- 業務属性
  type                    VARCHAR(20) NOT NULL,
  status                  VARCHAR(20) NOT NULL,
  conducted_at            DATE NOT NULL,
  
  -- AI/マスキング関連
  source_transcript       TEXT NOT NULL,        -- 音声原文(将来 pgcrypto で暗号化検討)
  masked_summary          TEXT NOT NULL,        -- マスク済み要約(画面表示時にアンマスク)
  placeholder_map         JSONB NOT NULL,       -- アンマスク用辞書
  
  -- 監査・メタ
  created_by              UUID NOT NULL REFERENCES app_users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at            TIMESTAMPTZ,
  
  -- 楽観的ロック
  version                 INTEGER NOT NULL DEFAULT 1,
  
  -- 制約
  CONSTRAINT assessment_type_valid
    CHECK (type IN ('initial', 'reassessment')),
  CONSTRAINT assessment_status_valid
    CHECK (status IN ('draft', 'finalized')),
  CONSTRAINT assessment_finalized_consistency
    CHECK (
      (status = 'finalized' AND finalized_at IS NOT NULL) OR
      (status = 'draft' AND finalized_at IS NULL)
    )
);

CREATE INDEX idx_assessments_tenant_recipient
  ON assessments(tenant_id, care_recipient_id);
CREATE INDEX idx_assessments_tenant_status
  ON assessments(tenant_id, status);
CREATE INDEX idx_assessments_tenant_conducted
  ON assessments(tenant_id, conducted_at DESC);
```

### 6.2 assessment_issues テーブル

```sql
CREATE TABLE assessment_issues (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  assessment_id           UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  
  sequence_no             INTEGER NOT NULL,
  category                VARCHAR(20) NOT NULL,
  description             TEXT NOT NULL,         -- マスク済み
  priority                VARCHAR(10) NOT NULL,
  
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT issue_category_valid
    CHECK (category IN ('health', 'adl', 'iadl', 'cognitive', 'social', 'family', 'other')),
  CONSTRAINT issue_priority_valid
    CHECK (priority IN ('high', 'medium', 'low')),
  CONSTRAINT issue_description_not_empty
    CHECK (length(trim(description)) > 0),
  CONSTRAINT issue_sequence_unique
    UNIQUE (assessment_id, sequence_no)
);

CREATE INDEX idx_issues_tenant_assessment
  ON assessment_issues(tenant_id, assessment_id);
CREATE INDEX idx_issues_priority
  ON assessment_issues(tenant_id, priority);
```

### 6.3 RLS 方針

```sql
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessments_tenant_isolation ON assessments
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );

CREATE POLICY assessment_issues_tenant_isolation ON assessment_issues
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
```

### 6.4 設計判断

| 判断 | 理由 |
|------|------|
| `source_transcript` を TEXT で平文保存(MVP) | 将来 pgcrypto で暗号化推奨。MVP は Supabase の標準暗号化(at-rest)に依存 |
| `source_transcript` は本集約が単一ソースとして保持 | `pii-masking-design.md` §6.2/§6.3 の方針により、`ai_generation_logs.original_text` は NULL 運用とし、`related_entity_id` で本テーブルを参照する。PII 平文の重複保存を避ける(M2) |
| `placeholder_map` を JSONB で保存 | 構造可変、検索要件は薄い、Postgres ネイティブで扱える |
| `assessment_id ON DELETE CASCADE` | 集約の生存単位が一致するため連動削除(MVP は物理削除しない方針) |
| `category` を ENUM ではなく VARCHAR + CHECK | ケアプラン同様、後から追加が容易 |
| `conducted_at` を DATE 型 | 訪問日は時刻情報不要 |
| `idx_assessments_tenant_conducted` を DESC で作成 | 「最新のアセスメント順に表示」が頻出クエリ |

---

## 7. リポジトリ層

### 7.1 インターフェース

```typescript
// domain/care-management/assessment/IAssessmentRepository.ts

export interface IAssessmentRepository {
  /** ID で取得(見つからない場合は null) */
  findById(id: AssessmentId, tenantId: TenantId): Promise<Assessment | null>;

  /** 利用者の全アセスメント(実施日の新しい順) */
  findByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment[]>;

  /** 利用者の最新の Finalized アセスメント */
  findLatestFinalizedByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment | null>;

  /** 集約全体を 1 トランザクションで保存 */
  save(assessment: Assessment): Promise<void>;
}
```

### 7.2 インターフェース設計のポイント

| ポイント | 理由 |
|---------|------|
| `findById` は `null` 許容 | 「存在しない」は業務上ありえる |
| `tenantId` を明示的に受け取る | 二重チェック、型レベルでテナント意識を強制 |
| `save` 一本で作成・更新両対応 | ドメインの意図は「集約を保存する」ことのみ |
| `findLatestFinalizedByRecipient` を追加 | ケアプラン作成時の基本クエリ |
| `delete` がない | MVP では物理削除しない |

### 7.3 実装(ケアプランと同じパターン)

```typescript
// infrastructure/repositories/SupabaseAssessmentRepository.ts

export class SupabaseAssessmentRepository implements IAssessmentRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: AssessmentId, tenantId: TenantId): Promise<Assessment | null> {
    const { data: assessmentRow, error } = await this.supabase
      .from('assessments')
      .select('*')
      .eq('id', id.value)
      .eq('tenant_id', tenantId.value)
      .maybeSingle();

    if (error) throw new RepositoryError(error.message);
    if (!assessmentRow) return null;

    const { data: issueRows } = await this.supabase
      .from('assessment_issues')
      .select('*')
      .eq('assessment_id', id.value)
      .eq('tenant_id', tenantId.value)
      .order('sequence_no');

    return AssessmentMapper.toDomain({
      assessment: assessmentRow,
      issues: issueRows ?? [],
    });
  }

  async findLatestFinalizedByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment | null> {
    const { data, error } = await this.supabase
      .from('assessments')
      .select('*')
      .eq('care_recipient_id', recipientId.value)
      .eq('tenant_id', tenantId.value)
      .eq('status', 'finalized')
      .order('conducted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new RepositoryError(error.message);
    if (!data) return null;

    return this.findById(new AssessmentId(data.id), tenantId);
  }

  async save(assessment: Assessment): Promise<void> {
    const payload = AssessmentMapper.toPersistence(assessment);

    const { error } = await this.supabase.rpc('save_assessment', {
      p_payload: payload,
    });

    if (error) {
      if (error.message.includes('version_conflict')) {
        throw new OptimisticLockError(
          '他のユーザーが同時に更新しました。再読み込みしてください。',
        );
      }
      throw new RepositoryError(error.message);
    }
  }
}
```

### 7.4 RPC 関数(ケアプランと同じ全削除→再挿入戦略)

**子エンティティ ID の永続性(M3)**: 以下の RPC は `issue->>'id'` をそのまま INSERT する契約。`AssessmentMapper.toPersistence` が **ドメインが保持する `AssessmentIssue.id.value` を必ずペイロードに含める** ことで、全削除→再挿入後も同じ ID が維持される。これにより `updateIssue(issueId, ...)` / `removeIssue(issueId)` の外部参照 ID が DB 再挿入後も有効になる。


```sql
CREATE OR REPLACE FUNCTION save_assessment(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_assessment_id UUID;
  v_current_version INTEGER;
  v_new_version INTEGER;
  v_assessment JSONB;
BEGIN
  v_assessment := p_payload->'assessment';
  v_assessment_id := (v_assessment->>'id')::UUID;
  v_new_version := (v_assessment->>'version')::INTEGER;

  SELECT version INTO v_current_version
  FROM assessments WHERE id = v_assessment_id;

  IF v_current_version IS NULL THEN
    -- 新規 INSERT
    INSERT INTO assessments (
      id, tenant_id, care_recipient_id, type, status,
      conducted_at, source_transcript, masked_summary, placeholder_map,
      created_by, created_at, updated_at, finalized_at, version
    ) VALUES (
      v_assessment_id,
      (v_assessment->>'tenant_id')::UUID,
      (v_assessment->>'care_recipient_id')::UUID,
      v_assessment->>'type',
      v_assessment->>'status',
      (v_assessment->>'conducted_at')::DATE,
      v_assessment->>'source_transcript',
      v_assessment->>'masked_summary',
      v_assessment->'placeholder_map',
      (v_assessment->>'created_by')::UUID,
      (v_assessment->>'created_at')::TIMESTAMPTZ,
      (v_assessment->>'updated_at')::TIMESTAMPTZ,
      NULLIF(v_assessment->>'finalized_at', '')::TIMESTAMPTZ,
      v_new_version
    );
  ELSE
    -- 楽観的ロックチェック
    IF v_current_version != v_new_version THEN
      RAISE EXCEPTION 'version_conflict: expected %, got %',
        v_current_version, v_new_version;
    END IF;
    UPDATE assessments
    SET status = v_assessment->>'status',
        masked_summary = v_assessment->>'masked_summary',
        placeholder_map = v_assessment->'placeholder_map',
        updated_at = (v_assessment->>'updated_at')::TIMESTAMPTZ,
        finalized_at = NULLIF(v_assessment->>'finalized_at', '')::TIMESTAMPTZ,
        version = version + 1
    WHERE id = v_assessment_id;
  END IF;

  -- 課題は全削除→再挿入
  DELETE FROM assessment_issues WHERE assessment_id = v_assessment_id;

  INSERT INTO assessment_issues (
    id, tenant_id, assessment_id, sequence_no, category, description, priority
  )
  SELECT
    (issue->>'id')::UUID,
    (v_assessment->>'tenant_id')::UUID,
    v_assessment_id,
    (issue->>'sequence_no')::INTEGER,
    issue->>'category',
    issue->>'description',
    issue->>'priority'
  FROM jsonb_array_elements(p_payload->'issues') AS issue;
END;
$$;
```

---

## 8. ユースケース層との接続

### 8.1 PIIマスキング設計との整合

`pii-masking-design.md` で定義した `GenerateAssessmentFromMaskedTextUseCase` は、
本集約設計に合わせて以下のように呼び出す。

```typescript
async execute(input: GenerateAssessmentFromMaskedTextInput): Promise<...> {
  // ... マスキングドラフト取得 ...

  // 1. AI 要約結果を AssessmentIssue にマップ
  const issues = summarizationResult.issues.map((issue, idx) =>
    AssessmentIssue.create({
      category: issue.category,
      description: issue.description,  // マスク済みのまま
      priority: issue.priority,
      sequenceNo: idx + 1,
    }),
  );

  // 2. PlaceholderMapSnapshot を構築
  const placeholderMap = PlaceholderMapSnapshot.create(
    draft.maskingResult.placeholders.map(p => ({
      token: p.token,
      originalValue: p.originalValue,
      category: p.category,
    })),
  );

  // 3. アセスメント集約を生成
  const assessment = Assessment.create({
    tenantId,
    careRecipientId: draft.careRecipientId,
    type: input.type,  // 'initial' | 'reassessment'
    issues,
    sourceTranscript: draft.maskingResult.originalText,
    maskedSummary: draft.maskingResult.maskedText,
    placeholderMap,
    conductedAt: input.conductedAt,
    createdBy: new UserId(input.auth.userId),
  });

  // 4. 永続化
  await this.assessmentRepo.save(assessment);

  return {
    assessmentId: assessment.id.value,
    issues: assessment.issues.map(i => ({
      category: i.category,
      description: i.description,  // マスク済みのまま返す(画面側でアンマスク)
      priority: i.priority,
    })),
  };
}
```

### 8.2 表示用ユースケース

```typescript
// application/care-management/assessment/GetAssessmentForViewUseCase.ts

export class GetAssessmentForViewUseCase {
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: {
    auth: AuthorizationContext;
    assessmentId: string;
  }): Promise<AssessmentViewDto> {
    const tenantId = new TenantId(input.auth.tenantId);
    const assessment = await this.assessmentRepo.findById(
      new AssessmentId(input.assessmentId),
      tenantId,
    );

    if (!assessment) {
      throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');
    }

    // 表示用としてアンマスク
    return {
      id: assessment.id.value,
      type: assessment.type,
      status: assessment.status,
      conductedAt: assessment.conductedAt,
      summary: assessment.getUnmaskedSummary(),
      issues: assessment.issues.map(i => ({
        id: i.id.value,
        category: i.category,
        description: assessment.getUnmaskedIssueDescription(i.id),
        priority: i.priority,
      })),
    };
  }
}
```

### 8.3 確定ユースケース

```typescript
// application/care-management/assessment/FinalizeAssessmentUseCase.ts

export class FinalizeAssessmentUseCase {
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: {
    auth: AuthorizationContext;
    assessmentId: string;
  }): Promise<void> {
    const tenantId = new TenantId(input.auth.tenantId);
    const assessment = await this.assessmentRepo.findById(
      new AssessmentId(input.assessmentId),
      tenantId,
    );

    if (!assessment) {
      throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');
    }

    assessment.finalize();  // ドメインが不変条件を守る
    await this.assessmentRepo.save(assessment);
  }
}
```

---

## 9. テスト方針

### 9.1 ドメイン層単体テスト(必須)

```typescript
describe('Assessment', () => {
  describe('create', () => {
    it('課題が0件だと作成できない', () => {
      expect(() => Assessment.create({ /* issues: [] */ }))
        .toThrow(AssessmentValidationError);
    });

    it('正常に作成できる', () => {
      const assessment = Assessment.create({ /* 正常パラメータ */ });
      expect(assessment.status).toBe(AssessmentStatus.Draft);
    });
  });

  describe('finalize', () => {
    it('Draft 状態のみ確定できる', () => {
      const assessment = Assessment.create({ /* ... */ });
      assessment.finalize();
      expect(assessment.status).toBe(AssessmentStatus.Finalized);
      expect(assessment.finalizedAt).not.toBeNull();
    });

    it('Finalized 状態を再度 finalize するとエラー', () => {
      const assessment = Assessment.create({ /* ... */ });
      assessment.finalize();
      expect(() => assessment.finalize())
        .toThrow(IllegalStateTransitionError);
    });
  });

  describe('removeIssue', () => {
    it('最後の課題は削除できない', () => {
      const assessment = Assessment.create({ /* issues: [issue1] */ });
      expect(() => assessment.removeIssue(issue1.id))
        .toThrow(AssessmentValidationError);
    });
  });

  describe('addIssue', () => {
    it('Finalized 状態では課題追加できない', () => {
      const assessment = Assessment.create({ /* ... */ });
      assessment.finalize();
      expect(() => assessment.addIssue(newIssue))
        .toThrow(IllegalStateTransitionError);
    });
  });

  describe('getUnmaskedSummary', () => {
    it('プレースホルダを元の値に戻す', () => {
      const placeholderMap = PlaceholderMapSnapshot.create([
        { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
      ]);
      const assessment = Assessment.create({
        maskedSummary: '{RECIPIENT_NAME_001} さんの状態',
        placeholderMap,
        /* ... */
      });
      expect(assessment.getUnmaskedSummary()).toBe('田中太郎 さんの状態');
    });
  });
});
```

### 9.2 統合テスト

- `SupabaseAssessmentRepository.save` → `findById` で復元したオブジェクトが等価であること
- 楽観的ロック: 同じ集約を2クライアントが同時更新した場合の動作確認
- RLS: 別テナントのアセスメントが取得できないこと

---

## 10. MVP 優先度マトリクス

### 10.1 ドメイン層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `Assessment` 集約ルート + ファクトリ + 不変条件 |
| 🔴 必須 | `AssessmentIssue` 子エンティティ |
| 🔴 必須 | `PlaceholderMapSnapshot` 値オブジェクト |
| 🔴 必須 | `AssessmentType` / `AssessmentStatus` 列挙型 |
| 🔴 必須 | `finalize()` 状態遷移メソッド |
| 🟡 推奨 | `getUnmaskedSummary` / `getUnmaskedIssueDescription` メソッド |
| 🟡 推奨 | `addIssue` / `removeIssue` / `updateIssue` 編集メソッド |
| 🟢 後回し | ドメインイベント(`AssessmentFinalized` など) |
| 🟢 後回し | `IssueCategory` の23項目化 |

### 10.2 DB スキーマ

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `assessments` / `assessment_issues` テーブル |
| 🔴 必須 | RLS によるテナント分離 |
| 🔴 必須 | CHECK 制約(type, status, category, priority) |
| 🟡 推奨 | `version` カラムによる楽観的ロック |
| 🟡 推奨 | `save_assessment` RPC 関数 |
| 🟢 後回し | `source_transcript` の暗号化(pgcrypto) |
| 🟢 後回し | 課題分類の23項目化 |

### 10.3 リポジトリ層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `IAssessmentRepository` インターフェース |
| 🔴 必須 | `SupabaseAssessmentRepository` 実装 |
| 🔴 必須 | `AssessmentMapper` |
| 🟡 推奨 | `findLatestFinalizedByRecipient` メソッド |
| 🟢 後回し | アセスメント検索クエリの拡張 |

### 10.4 ユースケース層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `GenerateAssessmentFromMaskedTextUseCase`(PIIマスキング設計と接続) |
| 🔴 必須 | `GetAssessmentForViewUseCase`(アンマスク含む) |
| 🔴 必須 | `FinalizeAssessmentUseCase` |
| 🟡 推奨 | `UpdateAssessmentIssueUseCase`(編集機能) |
| 🟡 推奨 | `AddAssessmentIssueUseCase` / `RemoveAssessmentIssueUseCase` |
| 🟢 後回し | 検索・一覧表示の高度なユースケース |

---

## 11. 未決定事項・今後の論点

| 論点 | 内容 |
|------|------|
| AI 課題分類の精度 | プロンプト設計時の few-shot 例の充実が必須(本ドキュメント範囲外) |
| 課題抽出 0件時のフォールバック | 案1(手動入力促し)を推奨だが、UX 設計時に確認 |
| ケアプランからの整合制約 | MVP はユースケース層チェック。複雑化したらドメインサービス昇格 |
| 課題分類の業務適合性 | MVP の7分類で実運用に耐えるか、利用者フィードバックで検証 |
| アセスメント間の差分表示 | 「再アセスメントで何が変わったか」のUI は将来検討 |
| 音声原文の暗号化 | MVP は Supabase 標準暗号化。pgcrypto 採用は運用後判断 |
| モニタリング集約の設計 | 別ドキュメントで設計(MVP スコープ外) |

---

## 付録A: 用語集

| 用語 | 定義 |
|------|------|
| アセスメント | 利用者の状態・ニーズを把握する情報収集・分析プロセス |
| 初回アセスメント | ケアプラン新規作成時に実施される最初のアセスメント |
| 再アセスメント | 利用者の状態変化時に実施される再評価 |
| モニタリング | ケアプラン実施状況の定期的な確認・評価(本集約のスコープ外) |
| 課題・ニーズ | アセスメントから抽出される、改善すべき問題点 |
| AssessmentIssue | アセスメント集約内の子エンティティとしての「課題」 |
| PlaceholderMapSnapshot | アンマスクに必要な情報を集約に保持する値オブジェクト |

---

## 付録B: ケアプラン集約との整合確認チェックリスト

ケアプラン集約から本集約を参照する際の制約:

- [x] `tenantId` が一致すること(両方が同じテナント) → RLS で担保
- [x] アセスメントが Finalized 状態であること → ユースケース層でチェック
- [x] アセスメントが論理削除されていないこと → MVP は物理/論理削除しない方針のため自動的に満たされる
- [x] アセスメントの `careRecipientId` がケアプランの `careRecipientId` と一致すること → ユースケース層でチェック

---

**ドキュメントバージョン**: 0.2(実装前レビュー反映版)
**最終更新**: 2026-04-23
**0.2 の主な変更点**:
- §5.3 アセスメント Finalize ステップを UI/ユースケース接続順序として明示(M1)
- §6.4 `source_transcript` を本集約の単一ソースとする方針を明記(M2 / `pii-masking-design.md` §6.2 と整合)
- §7.4 RPC コード例冒頭に、子エンティティ ID 永続性の契約を明記(M3)
**次回更新時の変更候補**:
- ナレッジコンテキスト設計後、RAGとの接続方針追加
- AI 課題分類のプロンプト設計詳細(別ドキュメント)
- モニタリング集約設計後、関係性の整理
