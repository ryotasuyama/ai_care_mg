import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import type { AssessmentType } from '@/domain/care-management/assessment/AssessmentType';

export const listAssessmentsSchema = z.object({
  careRecipientId: z.string().uuid().optional(),
});

export type ListAssessmentsInput = {
  auth: AuthorizationContext;
} & z.infer<typeof listAssessmentsSchema>;

export interface AssessmentSummaryDto {
  id: string;
  careRecipientId: string;
  careRecipientName: string;
  type: AssessmentType;
  status: AssessmentStatus;
  conductedAt: string;
  issueCount: number;
  finalizedAt: string | null;
}

export class ListAssessmentsUseCase
  implements IUseCase<ListAssessmentsInput, AssessmentSummaryDto[]>
{
  constructor(
    private readonly assessmentRepo: IAssessmentRepository,
    private readonly careRecipientRepo: ICareRecipientRepository,
  ) {}

  async execute(input: ListAssessmentsInput): Promise<AssessmentSummaryDto[]> {
    const parsed = listAssessmentsSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const assessments = input.careRecipientId
      ? await this.assessmentRepo.findByRecipient(new CareRecipientId(input.careRecipientId), tenantId)
      : await this.assessmentRepo.findAll(tenantId);

    if (assessments.length === 0) return [];

    const recipients = await this.careRecipientRepo.findAll(tenantId);
    const nameById = new Map(recipients.map((r) => [r.id.value, r.fullName]));

    return assessments.map((a) => ({
      id: a.id.value,
      careRecipientId: a.careRecipientId.value,
      careRecipientName: nameById.get(a.careRecipientId.value) ?? '不明',
      type: a.type,
      status: a.status,
      conductedAt: toDateOnly(a.conductedAt),
      issueCount: a.issues.length,
      finalizedAt: a.finalizedAt ? a.finalizedAt.toISOString() : null,
    }));
  }
}

function toDateOnly(d: Date): string {
  const [datePart] = d.toISOString().split('T');
  return datePart!;
}
