import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import { toAssessmentViewDto } from './dto/toAssessmentViewDto';
import type { AssessmentViewDto } from './dto/AssessmentViewDto';

export const getAssessmentForViewSchema = z.object({
  assessmentId: z.string().uuid('IDが不正です'),
});

export type GetAssessmentForViewInput = {
  auth: AuthorizationContext;
} & z.infer<typeof getAssessmentForViewSchema>;

export class GetAssessmentForViewUseCase
  implements IUseCase<GetAssessmentForViewInput, AssessmentViewDto>
{
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: GetAssessmentForViewInput): Promise<AssessmentViewDto> {
    const parsed = getAssessmentForViewSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const assessment = await this.assessmentRepo.findById(
      new AssessmentId(input.assessmentId),
      tenantId,
    );

    if (!assessment) {
      throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');
    }

    return toAssessmentViewDto(assessment);
  }
}
