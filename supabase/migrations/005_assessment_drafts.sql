-- アセスメントドラフト一時保存テーブル
-- 設計参照: docs/pii-masking-design.md §6.1, §6.3
-- TTL は pg_cron 不使用。リポジトリ読み取り時に created_at + 30min < now() を検証して
-- NOT_FOUND を返す方式とする (計画 03 §3 PR2)。

CREATE TABLE assessment_drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  care_recipient_id   UUID NOT NULL REFERENCES care_recipients(id),

  original_text       TEXT NOT NULL,
  masked_text         TEXT NOT NULL,
  placeholder_map     JSONB NOT NULL,

  created_by          UUID NOT NULL REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assessment_drafts_tenant
  ON assessment_drafts(tenant_id);
CREATE INDEX idx_assessment_drafts_created_at
  ON assessment_drafts(created_at);

ALTER TABLE assessment_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessment_drafts_tenant_isolation ON assessment_drafts
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
