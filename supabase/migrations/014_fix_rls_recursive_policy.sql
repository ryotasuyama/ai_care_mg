-- 014: app_users RLS 自己参照（再帰）問題を修正
--
-- 問題: app_users の RLS ポリシーがサブクエリで app_users 自身を参照しており、
--       any_table → app_users RLS → app_users → app_users RLS → ... の無限再帰が発生。
--
-- 修正: SECURITY DEFINER 関数（postgres ロールで実行し RLS をバイパス）を作成し、
--       app_users ポリシーの自己参照を解消する。

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT tenant_id FROM public.app_users WHERE id = auth.uid()
$$;

-- app_users ポリシーを差し替え
DROP POLICY IF EXISTS app_users_tenant_isolation ON public.app_users;

CREATE POLICY app_users_tenant_isolation ON public.app_users
  FOR SELECT
  USING (tenant_id = public.get_current_tenant_id());
