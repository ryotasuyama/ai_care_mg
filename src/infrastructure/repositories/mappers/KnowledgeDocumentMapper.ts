import { KnowledgeDocument } from '@/domain/knowledge/document/KnowledgeDocument';
import { KnowledgeDocumentId } from '@/domain/knowledge/document/KnowledgeDocumentId';
import { KnowledgeChunk } from '@/domain/knowledge/document/KnowledgeChunk';
import { KnowledgeChunkId } from '@/domain/knowledge/document/KnowledgeChunkId';
import { EmbeddingVector } from '@/domain/knowledge/document/EmbeddingVector';
import { SourceFile } from '@/domain/knowledge/document/SourceFile';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import type { Database } from '@/types/database';

type DocRow = Database['public']['Tables']['knowledge_documents']['Row'];
type ChunkRow = Database['public']['Tables']['knowledge_chunks']['Row'];

export class KnowledgeDocumentMapper {
  static toDomain(input: { document: DocRow; chunks: ChunkRow[] }): KnowledgeDocument {
    const chunks = input.chunks
      .slice()
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((row) =>
        KnowledgeChunk.reconstruct({
          id: new KnowledgeChunkId(row.id),
          sequenceNo: row.sequence_no,
          text: row.text,
          embedding: EmbeddingVector.reconstruct(parsePgVector(row.embedding)),
          pageNumber: row.page_number,
        }),
      );

    return KnowledgeDocument.reconstruct({
      id: new KnowledgeDocumentId(input.document.id),
      tenantId: new TenantId(input.document.tenant_id),
      scope: input.document.scope,
      ownerId: input.document.owner_id ? new UserId(input.document.owner_id) : null,
      title: input.document.title,
      sourceFile: SourceFile.reconstruct({
        url: input.document.source_file_url,
        storagePath: input.document.source_file_path,
        type: input.document.source_file_type,
        sizeBytes: Number(input.document.source_file_size_bytes),
      }),
      chunks,
      processingStatus: input.document.processing_status,
      processingError: input.document.processing_error,
      uploadedBy: new UserId(input.document.uploaded_by),
      uploadedAt: new Date(input.document.uploaded_at),
      updatedAt: new Date(input.document.updated_at),
      readyAt: input.document.ready_at ? new Date(input.document.ready_at) : null,
      version: input.document.version,
    });
  }

  static toInsertRow(
    document: KnowledgeDocument,
  ): Database['public']['Tables']['knowledge_documents']['Insert'] {
    return {
      id: document.id.value,
      tenant_id: document.tenantId.value,
      scope: document.scope,
      owner_id: document.ownerId?.value ?? null,
      title: document.title,
      source_file_url: document.sourceFile.url,
      source_file_path: document.sourceFile.storagePath,
      source_file_type: document.sourceFile.type,
      source_file_size_bytes: document.sourceFile.sizeBytes,
      processing_status: document.processingStatus,
      processing_error: document.processingError,
      uploaded_by: document.uploadedBy.value,
      uploaded_at: document.uploadedAt.toISOString(),
      updated_at: document.updatedAt.toISOString(),
      ready_at: document.readyAt ? document.readyAt.toISOString() : null,
      version: document.version,
    };
  }

  static toUpdateRow(
    document: KnowledgeDocument,
  ): Database['public']['Tables']['knowledge_documents']['Update'] {
    return {
      title: document.title,
      processing_status: document.processingStatus,
      processing_error: document.processingError,
      ready_at: document.readyAt ? document.readyAt.toISOString() : null,
      version: document.version,
    };
  }

  static chunkInsertRow(
    document: KnowledgeDocument,
    chunk: KnowledgeChunk,
  ): Database['public']['Tables']['knowledge_chunks']['Insert'] {
    return {
      id: chunk.id.value,
      tenant_id: document.tenantId.value,
      document_id: document.id.value,
      scope: document.scope,
      owner_id: document.ownerId?.value ?? null,
      sequence_no: chunk.sequenceNo,
      text: chunk.text,
      embedding: chunk.embedding.toPgVectorLiteral(),
      page_number: chunk.pageNumber,
    };
  }
}

function parsePgVector(raw: string): number[] {
  // Supabase は VECTOR を '[0.1,0.2,...]' 形式の文字列として返す
  if (typeof raw !== 'string') return [];
  const trimmed = raw.replace(/^\[/, '').replace(/\]$/, '');
  if (trimmed.length === 0) return [];
  return trimmed
    .split(',')
    .map((v) => Number.parseFloat(v.trim()))
    .filter((n) => !Number.isNaN(n));
}
