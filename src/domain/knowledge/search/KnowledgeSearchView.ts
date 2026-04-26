import type { KnowledgeScope } from '@/domain/knowledge/document/types';

export interface KnowledgeSearchView {
  documentId: string;
  documentTitle: string;
  chunkText: string;
  chunkPageNumber: number | null;
  similarity: number;
  scope: KnowledgeScope;
}
