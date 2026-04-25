-- AI生成ログテーブル
-- original_text は NULLABLE。アセスメント等の集約が単一ソースを保持する場合は NULL とし
-- related_entity_id で参照する（単一ソース原則）。
-- 集約を持たないケース（kind='email_reply_draft' 等）では NOT NULL 運用とする。
CREATE TABLE ai_generation_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),

  -- 用途識別
  kind                 VARCHAR(50) NOT NULL,

  -- マスキング関連
  original_text        TEXT,
  masked_text          TEXT NOT NULL,
  placeholder_map      JSONB NOT NULL,
  masking_stats        JSONB,

  -- AI応答
  ai_response          JSONB NOT NULL,
  ai_model             VARCHAR(50),
  prompt_template_id   VARCHAR(100),

  -- 関連エンティティ（任意）
  related_entity_type  VARCHAR(50),
  related_entity_id    UUID,

  -- メタ
  created_by           UUID NOT NULL REFERENCES app_users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- レイテンシ・コスト記録
  request_tokens       INTEGER,
  response_tokens      INTEGER,
  latency_ms           INTEGER
);

CREATE INDEX idx_ai_logs_tenant_kind
  ON ai_generation_logs(tenant_id, kind);

CREATE INDEX idx_ai_logs_related_entity
  ON ai_generation_logs(related_entity_type, related_entity_id);

CREATE INDEX idx_ai_logs_created_at
  ON ai_generation_logs(created_at DESC);

ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_logs_tenant_isolation ON ai_generation_logs
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
