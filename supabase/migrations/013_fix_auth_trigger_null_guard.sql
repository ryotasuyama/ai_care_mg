-- 013: auth トリガーに tenant_id null ガードを追加
-- tenant_id なしでの管理者ユーザー作成（招待前の状態等）で 500 エラーが発生していた問題を修正

CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF (NEW.raw_user_meta_data->>'tenant_id') IS NOT NULL THEN
    INSERT INTO app_users (id, tenant_id, role, display_name, email)
    VALUES (
      NEW.id,
      (NEW.raw_user_meta_data->>'tenant_id')::UUID,
      COALESCE(NEW.raw_user_meta_data->>'role', 'care_manager'),
      COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
      NEW.email
    );
  END IF;
  RETURN NEW;
END;
$$;
