-- 002: 利用者テーブルと要介護度履歴テーブル

CREATE TABLE care_recipients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),

  -- 基本情報（PII）
  full_name           TEXT NOT NULL,
  date_of_birth       DATE NOT NULL,
  address             TEXT NOT NULL,
  phone_number        TEXT,

  -- 家族情報（PII、JSONB）
  -- 構造: [{ "name": "田中花子", "relation": "長女", "phone_number": "090-..." }]
  family_members      JSONB NOT NULL DEFAULT '[]',

  -- 要介護度（最新値のみ。変更履歴は care_level_histories へ）
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

-- 要介護度履歴テーブル
CREATE TABLE care_level_histories (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  care_recipient_id   UUID NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,

  previous_care_level VARCHAR(20),          -- 初回登録時は NULL
  new_care_level      VARCHAR(20) NOT NULL,
  changed_at          DATE NOT NULL,
  reason              TEXT,                 -- 認定更新・区分変更など

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

-- 要介護度変更時の自動履歴記録トリガー
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
