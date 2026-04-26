import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { TenantId } from '@/domain/shared/TenantId';
import type { IKnowledgeDocumentRepository } from '@/domain/knowledge/document/IKnowledgeDocumentRepository';
import type {
  KnowledgeScope,
  ProcessingStatus,
} from '@/domain/knowledge/document/types';

export interface KnowledgeDocumentSummaryDto {
  id: string;
  title: string;
  scope: KnowledgeScope;
  ownerId: string | null;
  fileType: string;
  fileSizeBytes: number;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  uploadedBy: string;
  uploadedAt: string;
  readyAt: string | null;
}

export class ListKnowledgeDocumentsUseCase
  implements IUseCase<{ auth: AuthorizationContext }, KnowledgeDocumentSummaryDto[]>
{
  constructor(private readonly repo: IKnowledgeDocumentRepository) {}

  async execute(input: { auth: AuthorizationContext }): Promise<KnowledgeDocumentSummaryDto[]> {
    const tenantId = new TenantId(input.auth.tenantId);
    const docs = await this.repo.findAll(tenantId);
    return docs.map((d) => ({
      id: d.id.value,
      title: d.title,
      scope: d.scope,
      ownerId: d.ownerId?.value ?? null,
      fileType: d.sourceFile.type,
      fileSizeBytes: d.sourceFile.sizeBytes,
      processingStatus: d.processingStatus,
      processingError: d.processingError,
      uploadedBy: d.uploadedBy.value,
      uploadedAt: d.uploadedAt.toISOString(),
      readyAt: d.readyAt ? d.readyAt.toISOString() : null,
    }));
  }
}
