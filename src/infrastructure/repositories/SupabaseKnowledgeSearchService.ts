import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { IKnowledgeSearchService } from '@/domain/knowledge/search/IKnowledgeSearchService';
import type { KnowledgeSearchView } from '@/domain/knowledge/search/KnowledgeSearchView';
import type { IEmbeddingService } from '@/domain/ai-support/IEmbeddingService';
import { EmbeddingVector } from '@/domain/knowledge/document/EmbeddingVector';
import type { TenantId } from '@/domain/shared/TenantId';
import type { UserId } from '@/domain/shared/UserId';

export class SupabaseKnowledgeSearchService implements IKnowledgeSearchService {
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async searchByText(params: {
    queryText: string;
    tenantId: TenantId;
    requesterId: UserId;
    topK?: number;
    minSimilarity?: number;
  }): Promise<KnowledgeSearchView[]> {
    if (params.queryText.trim().length === 0) return [];

    // 1. Gemini Embedding でクエリベクトル化
    const queryVec = await this.embeddingService.embed(params.queryText);
    const pgVecLiteral = toPgVectorLiteral(queryVec.values.slice());

    // 2. RPC 経由で類似度検索 (RLS が自動適用される)
    const { data, error } = await this.supabase.rpc('search_knowledge', {
      p_query_embedding: pgVecLiteral,
      p_tenant_id: params.tenantId.value,
      p_top_k: params.topK ?? 5,
      p_min_similarity: params.minSimilarity ?? 0.5,
    });
    if (error) throw new Error(`search_knowledge RPC failed: ${error.message}`);

    const rows = data ?? [];
    return rows.map((r) => ({
      documentId: r.document_id,
      documentTitle: r.document_title,
      chunkText: r.chunk_text,
      chunkPageNumber: r.page_number,
      similarity: r.similarity,
      scope: r.scope,
    }));
  }
}

function toPgVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

// Re-export for tests
export const __test__ = { toPgVectorLiteral };
// 引数チェック用未使用 import 抑止
void EmbeddingVector;
