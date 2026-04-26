-- can_access_knowledge 関数 + RLS ポリシー (両テーブルに FOR ALL)
-- 設計参照: docs/knowledge-context-design.md §5

CREATE OR REPLACE FUNCTION can_access_knowledge(
  p_tenant_id UUID,
  p_scope VARCHAR,
  p_owner_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_user_tenant_id UUID;
BEGIN
  SELECT tenant_id INTO v_user_tenant_id
  FROM app_users WHERE id = auth.uid();

  IF v_user_tenant_id IS NULL OR v_user_tenant_id != p_tenant_id THEN
    RETURN FALSE;
  END IF;

  RETURN p_scope = 'shared'
      OR (p_scope = 'personal' AND p_owner_id = auth.uid());
END;
$$;

ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY doc_access ON knowledge_documents
  FOR ALL
  USING (can_access_knowledge(tenant_id, scope, owner_id))
  WITH CHECK (can_access_knowledge(tenant_id, scope, owner_id));

CREATE POLICY chunk_access ON knowledge_chunks
  FOR ALL
  USING (can_access_knowledge(tenant_id, scope, owner_id))
  WITH CHECK (can_access_knowledge(tenant_id, scope, owner_id));
