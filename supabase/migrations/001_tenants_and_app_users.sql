-- 001: テナント・ユーザーテーブルと Auth 同期トリガー

CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE POLICY app_users_tenant_isolation ON app_users
  FOR SELECT
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );

-- Auth ユーザー作成時に app_users を自動作成するトリガー関数
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

-- Storage バケット（ナレッジ用、将来利用）
INSERT INTO storage.buckets (id, name, public)
VALUES ('knowledge-documents', 'knowledge-documents', false)
ON CONFLICT (id) DO NOTHING;
