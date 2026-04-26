-- ベクトル検索 RPC: search_knowledge
-- 設計参照: docs/knowledge-context-design.md §6.1

CREATE OR REPLACE FUNCTION search_knowledge(
  p_query_embedding VECTOR(768),
  p_tenant_id UUID,
  p_top_k INTEGER DEFAULT 5,
  p_min_similarity REAL DEFAULT 0.5
) RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  document_title TEXT,
  chunk_text TEXT,
  page_number INTEGER,
  scope VARCHAR,
  similarity REAL
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.document_id,
    d.title,
    c.text,
    c.page_number,
    c.scope,
    (1 - (c.embedding <=> p_query_embedding))::REAL AS similarity
  FROM knowledge_chunks c
  JOIN knowledge_documents d ON c.document_id = d.id
  WHERE c.tenant_id = p_tenant_id
    AND d.processing_status = 'ready'
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_min_similarity
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT p_top_k;
END;
$$;
