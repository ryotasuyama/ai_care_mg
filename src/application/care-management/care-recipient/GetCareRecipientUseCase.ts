import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { TenantId } from '@/domain/shared/TenantId';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { toCareRecipientDto } from './dto/toCareRecipientDto';
import type { CareRecipientDto } from './dto/CareRecipientDto';

export interface GetCareRecipientInput {
  auth: AuthorizationContext;
  id: string;
}

export class GetCareRecipientUseCase
  implements IUseCase<GetCareRecipientInput, CareRecipientDto>
{
  constructor(private readonly repo: ICareRecipientRepository) {}

  async execute(input: GetCareRecipientInput): Promise<CareRecipientDto> {
    const tenantId = new TenantId(input.auth.tenantId);
    const recipient = await this.repo.findById(new CareRecipientId(input.id), tenantId);
    if (!recipient) throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');
    return toCareRecipientDto(recipient);
  }
}
