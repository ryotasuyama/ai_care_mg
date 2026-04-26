import type { TenantId } from '@/domain/shared/TenantId';
import type { UserId } from '@/domain/shared/UserId';
import type { KnowledgeSearchView } from './KnowledgeSearchView';

export interface IKnowledgeSearchService {
  searchByText(params: {
    queryText: string;
    tenantId: TenantId;
    requesterId: UserId;
    topK?: number;
    minSimilarity?: number;
  }): Promise<KnowledgeSearchView[]>;
}
