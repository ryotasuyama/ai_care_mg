-- ケアプラン集約 + 子テーブル 3 つ + RLS
-- 設計参照: docs/care-plan-aggregate-design.md §6
-- 状態は 3 値 (Draft → Finalized → Archived) で実装 (計画 04 §6 で決定)

CREATE TABLE care_plans (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  care_recipient_id       UUID NOT NULL REFERENCES care_recipients(id),
  assessment_id           UUID NOT NULL REFERENCES assessments(id),

  plan_number             VARCHAR(50) NOT NULL,
  plan_period_from        DATE NOT NULL,
  plan_period_to          DATE NOT NULL,
  status                  VARCHAR(20) NOT NULL,

  created_by              UUID NOT NULL REFERENCES app_users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at            TIMESTAMPTZ,

  version                 INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT care_plan_period_valid
    CHECK (plan_period_from < plan_period_to),
  CONSTRAINT care_plan_status_valid
    CHECK (status IN ('draft', 'finalized', 'archived')),
  CONSTRAINT care_plan_finalized_consistency
    CHECK (
      (status = 'draft' AND finalized_at IS NULL)
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

ALTER TABLE care_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_long_term_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_short_term_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE care_plan_service_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY care_plans_tenant_isolation ON care_plans
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()))
  WITH CHECK (tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid()));

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
