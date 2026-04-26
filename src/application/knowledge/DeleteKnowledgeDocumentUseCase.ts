import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { KnowledgeDocumentId } from '@/domain/knowledge/document/KnowledgeDocumentId';
import type { IKnowledgeDocumentRepository } from '@/domain/knowledge/document/IKnowledgeDocumentRepository';
import type { IKnowledgeStorageService } from '@/domain/knowledge/document/IKnowledgeStorageService';

export interface DeleteKnowledgeDocumentInput {
  auth: AuthorizationContext;
  documentId: string;
}

export class DeleteKnowledgeDocumentUseCase
  implements IUseCase<DeleteKnowledgeDocumentInput, void>
{
  constructor(
    private readonly repo: IKnowledgeDocumentRepository,
    private readonly storage: IKnowledgeStorageService,
  ) {}

  async execute(input: DeleteKnowledgeDocumentInput): Promise<void> {
    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    const doc = await this.repo.findById(new KnowledgeDocumentId(input.documentId), tenantId);
    if (!doc) {
      throw new UseCaseError('NOT_FOUND', 'ナレッジが見つかりません');
    }

    if (doc.scope === 'shared' && input.auth.role !== 'admin') {
      throw new UseCaseError('FORBIDDEN', '共有ナレッジは管理者のみ削除できます');
    }
    if (doc.scope === 'personal' && !doc.canBeAccessedBy(userId, tenantId)) {
      throw new UseCaseError('FORBIDDEN', '所有者以外は個人ナレッジを削除できません');
    }

    // DB 削除を先行 (子テーブルは ON DELETE CASCADE)
    await this.repo.delete(doc.id, tenantId);

    // Storage 削除は best-effort
    try {
      await this.storage.delete(doc.sourceFile.storagePath);
    } catch (error) {
      // オーファン掃除で回収するため業務エラーにしない
      console.warn('Storage 削除失敗。オーファン掃除で回収予定', error);
    }
  }
}
