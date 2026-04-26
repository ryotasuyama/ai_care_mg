import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { TenantId } from '@/domain/shared/TenantId';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';

export interface DeleteCareRecipientInput {
  auth: AuthorizationContext;
  id: string;
}

export class DeleteCareRecipientUseCase
  implements IUseCase<DeleteCareRecipientInput, void>
{
  constructor(private readonly repo: ICareRecipientRepository) {}

  async execute(input: DeleteCareRecipientInput): Promise<void> {
    const tenantId = new TenantId(input.auth.tenantId);
    const recipientId = new CareRecipientId(input.id);
    const existing = await this.repo.findById(recipientId, tenantId);
    if (!existing) throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');
    await this.repo.delete(recipientId, tenantId);
  }
}
