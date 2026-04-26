import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { IKnowledgeDocumentRepository } from '@/domain/knowledge/document/IKnowledgeDocumentRepository';
import { KnowledgeDocument } from '@/domain/knowledge/document/KnowledgeDocument';
import { KnowledgeDocumentId } from '@/domain/knowledge/document/KnowledgeDocumentId';
import type { TenantId } from '@/domain/shared/TenantId';
import { KnowledgeDocumentMapper } from './mappers/KnowledgeDocumentMapper';
import { OptimisticLockError, RepositoryError } from './SupabaseAssessmentRepository';

type DocRow = Database['public']['Tables']['knowledge_documents']['Row'];
type ChunkRow = Database['public']['Tables']['knowledge_chunks']['Row'];

export class SupabaseKnowledgeDocumentRepository implements IKnowledgeDocumentRepository {
  /**
   * @param supabase RLS 経由のクライアント (テナント分離)
   * @param serviceRoleSupabase 任意。Cron / オーファン掃除などで RLS をバイパスするとき使う
   */
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly serviceRoleSupabase?: SupabaseClient<Database>,
  ) {}

  private get adminClient(): SupabaseClient<Database> {
    return this.serviceRoleSupabase ?? this.supabase;
  }

  async findById(id: KnowledgeDocumentId, tenantId: TenantId): Promise<KnowledgeDocument | null> {
    const [{ data: docRow, error: dErr }, { data: chunkRows, error: cErr }] = await Promise.all([
      this.supabase
        .from('knowledge_documents')
        .select('*')
        .eq('id', id.value)
        .eq('tenant_id', tenantId.value)
        .maybeSingle(),
      this.supabase
        .from('knowledge_chunks')
        .select('*')
        .eq('document_id', id.value)
        .eq('tenant_id', tenantId.value)
        .order('sequence_no'),
    ]);

    if (dErr) throw new RepositoryError(dErr.message);
    if (cErr) throw new RepositoryError(cErr.message);
    if (!docRow) return null;

    return KnowledgeDocumentMapper.toDomain({
      document: docRow,
      chunks: chunkRows ?? [],
    });
  }

  async findAll(tenantId: TenantId): Promise<KnowledgeDocument[]> {
    const { data, error } = await this.supabase
      .from('knowledge_documents')
      .select('*')
      .eq('tenant_id', tenantId.value)
      .order('uploaded_at', { ascending: false });
    if (error) throw new RepositoryError(error.message);
    return this.hydrateMany(data ?? []);
  }

  async findPendingDocuments(batchSize: number): Promise<KnowledgeDocument[]> {
    const client = this.adminClient;
    const { data, error } = await client
      .from('knowledge_documents')
      .select('*')
      .eq('processing_status', 'pending')
      .order('uploaded_at', { ascending: true })
      .limit(batchSize);
    if (error) throw new RepositoryError(error.message);
    return (data ?? []).map((row) =>
      KnowledgeDocumentMapper.toDomain({ document: row, chunks: [] }),
    );
  }

  async findAllStoragePaths(): Promise<Set<string>> {
    const { data, error } = await this.adminClient
      .from('knowledge_documents')
      .select('source_file_path');
    if (error) throw new RepositoryError(error.message);
    return new Set((data ?? []).map((r) => r.source_file_path));
  }

  async rescueStuckProcessing(thresholdMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - thresholdMs).toISOString();
    const { data, error } = await this.adminClient
      .from('knowledge_documents')
      .update({ processing_status: 'pending' })
      .eq('processing_status', 'processing')
      .lt('updated_at', cutoff)
      .select('id');
    if (error) throw new RepositoryError(error.message);
    return (data ?? []).length;
  }

  async save(document: KnowledgeDocument): Promise<void> {
    // バックグラウンドジョブが service role で更新する可能性があるため admin client を使う
    const client = this.adminClient;
    const { data: existing } = await client
      .from('knowledge_documents')
      .select('id, version')
      .eq('id', document.id.value)
      .maybeSingle();

    if (!existing) {
      const { error } = await client
        .from('knowledge_documents')
        .insert(KnowledgeDocumentMapper.toInsertRow(document));
      if (error) throw new RepositoryError(error.message);
      await this.replaceChunks(document, client);
      return;
    }

    if (existing.version !== document.version) {
      throw new OptimisticLockError();
    }

    const { error: updErr } = await client
      .from('knowledge_documents')
      .update({
        ...KnowledgeDocumentMapper.toUpdateRow(document),
        version: document.version + 1,
      })
      .eq('id', document.id.value);
    if (updErr) throw new RepositoryError(updErr.message);

    await this.replaceChunks(document, client);
  }

  async delete(id: KnowledgeDocumentId, tenantId: TenantId): Promise<void> {
    const { error } = await this.supabase
      .from('knowledge_documents')
      .delete()
      .eq('id', id.value)
      .eq('tenant_id', tenantId.value);
    if (error) throw new RepositoryError(error.message);
  }

  private async hydrateMany(rows: DocRow[]): Promise<KnowledgeDocument[]> {
    if (rows.length === 0) return [];
    // 一覧では chunks は不要なので空で復元
    return rows.map((r) =>
      KnowledgeDocumentMapper.toDomain({ document: r, chunks: [] }),
    );
  }

  private async replaceChunks(
    document: KnowledgeDocument,
    client: SupabaseClient<Database>,
  ): Promise<void> {
    if (document.chunks.length === 0) {
      // ready 以外はチャンクなしの状態。既存チャンクが残っていれば消す。
      await client.from('knowledge_chunks').delete().eq('document_id', document.id.value);
      return;
    }
    // 全削除 → 再挿入 (子 ID 永続性契約)
    const { error: delErr } = await client
      .from('knowledge_chunks')
      .delete()
      .eq('document_id', document.id.value);
    if (delErr) throw new RepositoryError(delErr.message);

    const inserts: ChunkRow[] | Database['public']['Tables']['knowledge_chunks']['Insert'][] =
      document.chunks.map((c) => KnowledgeDocumentMapper.chunkInsertRow(document, c));

    // チャンク数が多いと 1 回の INSERT で長くなるため 50 件ずつ分割
    const BATCH = 50;
    for (let i = 0; i < inserts.length; i += BATCH) {
      const slice = inserts.slice(i, i + BATCH);
      const { error } = await client.from('knowledge_chunks').insert(slice);
      if (error) throw new RepositoryError(error.message);
    }
  }
}
