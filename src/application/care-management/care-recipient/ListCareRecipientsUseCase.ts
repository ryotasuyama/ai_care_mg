import { TenantId } from '@/domain/shared/TenantId';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { toCareRecipientDto } from './dto/toCareRecipientDto';
import type { CareRecipientDto } from './dto/CareRecipientDto';

export interface ListCareRecipientsInput {
  auth: AuthorizationContext;
}

export class ListCareRecipientsUseCase
  implements IUseCase<ListCareRecipientsInput, CareRecipientDto[]>
{
  constructor(private readonly repo: ICareRecipientRepository) {}

  async execute(input: ListCareRecipientsInput): Promise<CareRecipientDto[]> {
    const tenantId = new TenantId(input.auth.tenantId);
    const recipients = await this.repo.findAll(tenantId);
    return recipients.map(toCareRecipientDto);
  }
}
