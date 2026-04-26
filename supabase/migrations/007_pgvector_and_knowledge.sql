-- pgvector 拡張 + ナレッジドキュメント・チャンクテーブル
-- 設計参照: docs/knowledge-context-design.md §4

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE knowledge_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),

  -- スコープ・所有者
  scope                   VARCHAR(20) NOT NULL,
  owner_id                UUID REFERENCES app_users(id),

  -- メタ情報
  title                   TEXT NOT NULL,
  source_file_url         TEXT NOT NULL,
  source_file_path        TEXT NOT NULL,
  source_file_type        VARCHAR(10) NOT NULL,
  source_file_size_bytes  BIGINT NOT NULL,

  -- 処理ステータス
  processing_status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  processing_error        TEXT,

  -- メタ
  uploaded_by             UUID NOT NULL REFERENCES app_users(id),
  uploaded_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at                TIMESTAMPTZ,

  -- 楽観的ロック
  version                 INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT knowledge_doc_scope_valid
    CHECK (scope IN ('personal', 'shared')),
  CONSTRAINT knowledge_doc_status_valid
    CHECK (processing_status IN ('pending', 'processing', 'ready', 'failed')),
  CONSTRAINT knowledge_doc_file_type_valid
    CHECK (source_file_type IN ('pdf', 'docx', 'txt')),
  CONSTRAINT knowledge_doc_personal_has_owner
    CHECK (
      (scope = 'personal' AND owner_id IS NOT NULL) OR
      (scope = 'shared' AND owner_id IS NULL)
    ),
  CONSTRAINT knowledge_doc_ready_consistency
    CHECK (
      (processing_status = 'ready' AND ready_at IS NOT NULL) OR
      (processing_status != 'ready')
    )
);

CREATE INDEX idx_knowledge_docs_tenant_scope
  ON knowledge_documents(tenant_id, scope);
CREATE INDEX idx_knowledge_docs_tenant_owner
  ON knowledge_documents(tenant_id, owner_id);
CREATE INDEX idx_knowledge_docs_status
  ON knowledge_documents(tenant_id, processing_status);

-- updated_at 自動更新トリガー (スタックジョブ救済 §8.4 で参照)
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_knowledge_docs_touch
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE knowledge_chunks (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id),
  document_id             UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,

  -- スコープ情報を非正規化 (RLS 性能 + ベクトル検索性能のため §4.4)
  scope                   VARCHAR(20) NOT NULL,
  owner_id                UUID,

  sequence_no             INTEGER NOT NULL,
  text                    TEXT NOT NULL,
  embedding               VECTOR(768) NOT NULL,
  page_number             INTEGER,

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chunk_sequence_unique
    UNIQUE (document_id, sequence_no),
  CONSTRAINT chunk_text_not_empty
    CHECK (length(trim(text)) > 0),
  CONSTRAINT chunk_scope_valid
    CHECK (scope IN ('personal', 'shared')),
  CONSTRAINT chunk_personal_has_owner
    CHECK (
      (scope = 'personal' AND owner_id IS NOT NULL) OR
      (scope = 'shared' AND owner_id IS NULL)
    )
);

CREATE INDEX idx_chunks_tenant_doc
  ON knowledge_chunks(tenant_id, document_id);

-- ベクトル類似度検索用 HNSW インデックス
CREATE INDEX idx_chunks_embedding_hnsw
  ON knowledge_chunks
  USING hnsw (embedding vector_cosine_ops);
