import { z } from 'zod';
import { CareRecipient } from '@/domain/care-management/care-recipient/CareRecipient';
import { CareLevel, CARE_LEVEL_VALUES } from '@/domain/care-management/care-recipient/CareLevel';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { ValidationError } from '@/domain/shared/errors/ValidationError';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { toCareRecipientDto } from './dto/toCareRecipientDto';
import type { CareRecipientDto } from './dto/CareRecipientDto';

export const registerCareRecipientSchema = z.object({
  fullName: z.string().min(1, '氏名は必須です'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '生年月日の形式が正しくありません'),
  address: z.string().min(1, '住所は必須です'),
  phoneNumber: z.string().optional(),
  currentCareLevel: z.enum(CARE_LEVEL_VALUES),
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

export type RegisterCareRecipientInput = {
  auth: AuthorizationContext;
} & z.infer<typeof registerCareRecipientSchema>;

export class RegisterCareRecipientUseCase
  implements IUseCase<RegisterCareRecipientInput, CareRecipientDto>
{
  constructor(private readonly repo: ICareRecipientRepository) {}

  async execute(input: RegisterCareRecipientInput): Promise<CareRecipientDto> {
    const parsed = registerCareRecipientSchema.safeParse(input);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new UseCaseError('INVALID_INPUT', first?.message ?? 'Invalid input');
    }

    try {
      const recipient = CareRecipient.create({
        tenantId: new TenantId(input.auth.tenantId),
        fullName: input.fullName,
        dateOfBirth: new Date(input.dateOfBirth),
        address: input.address,
        phoneNumber: input.phoneNumber,
        currentCareLevel: CareLevel.of(input.currentCareLevel),
        familyMembers: input.familyMembers,
        createdBy: new UserId(input.auth.userId),
      });

      await this.repo.save(recipient);
      return toCareRecipientDto(recipient);
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      throw new UseCaseError('INTERNAL_ERROR', '利用者登録に失敗しました', error);
    }
  }
}
