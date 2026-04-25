import { z } from 'zod';
import { CareLevel, CARE_LEVEL_VALUES } from '@/domain/care-management/care-recipient/CareLevel';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { TenantId } from '@/domain/shared/TenantId';
import { ValidationError } from '@/domain/shared/errors/ValidationError';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { toCareRecipientDto } from './dto/toCareRecipientDto';
import type { CareRecipientDto } from './dto/CareRecipientDto';

export const updateCareRecipientSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  phoneNumber: z.string().nullable().optional(),
  currentCareLevel: z.enum(CARE_LEVEL_VALUES).optional(),
  familyMembers: z
    .array(
      z.object({
        name: z.string().min(1),
        relation: z.string().min(1),
        phoneNumber: z.string().optional(),
      }),
    )
    .optional(),
});

export type UpdateCareRecipientInput = {
  auth: AuthorizationContext;
} & z.infer<typeof updateCareRecipientSchema>;

export class UpdateCareRecipientUseCase
  implements IUseCase<UpdateCareRecipientInput, CareRecipientDto>
{
  constructor(private readonly repo: ICareRecipientRepository) {}

  async execute(input: UpdateCareRecipientInput): Promise<CareRecipientDto> {
    const parsed = updateCareRecipientSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new UseCaseError('INVALID_INPUT', first?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const recipient = await this.repo.findById(new CareRecipientId(input.id), tenantId);
    if (!recipient) throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');

    try {
      recipient.update({
        fullName: input.fullName,
        address: input.address,
        phoneNumber: input.phoneNumber,
        currentCareLevel: input.currentCareLevel ? CareLevel.of(input.currentCareLevel) : undefined,
        familyMembers: input.familyMembers,
      });

      await this.repo.save(recipient);
      return toCareRecipientDto(recipient);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      throw new UseCaseError('INTERNAL_ERROR', '利用者更新に失敗しました', error);
    }
  }
}
