-- アセスメント集約: assessments + assessment_issues
-- 設計参照: docs/assessment-aggregate-design.md §6.1, §6.2, §6.3

CREATE TABLE assessments (
  -- 識別子
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- マルチテナント
  tenant_id           UUID NOT NULL REFERENCES tenants(id),

  -- 他集約への参照
  care_recipient_id   UUID NOT NULL REFERENCES care_recipients(id),

  -- 業務属性
  type                VARCHAR(20) NOT NULL,
  status              VARCHAR(20) NOT NULL,
  conducted_at        DATE NOT NULL,

  -- AI/マスキング関連
  source_transcript   TEXT NOT NULL,
  masked_summary      TEXT NOT NULL,
  placeholder_map     JSONB NOT NULL,

  -- 監査・メタ
  created_by          UUID NOT NULL REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at        TIMESTAMPTZ,

  -- 楽観的ロック
  version             INTEGER NOT NULL DEFAULT 1,

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

CREATE TABLE assessment_issues (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  assessment_id   UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,

  sequence_no     INTEGER NOT NULL,
  category        VARCHAR(20) NOT NULL,
  description     TEXT NOT NULL,
  priority        VARCHAR(10) NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

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
