import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentIssueId } from '@/domain/care-management/assessment/AssessmentIssueId';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import { AssessmentValidationError } from '@/domain/care-management/assessment/AssessmentValidationError';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { OptimisticLockError } from '@/infrastructure/repositories/SupabaseAssessmentRepository';

export const removeAssessmentIssueSchema = z.object({
  assessmentId: z.string().uuid(),
  issueId: z.string().uuid(),
});

export type RemoveAssessmentIssueInput = {
  auth: AuthorizationContext;
} & z.infer<typeof removeAssessmentIssueSchema>;

export class RemoveAssessmentIssueUseCase
  implements IUseCase<RemoveAssessmentIssueInput, void>
{
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: RemoveAssessmentIssueInput): Promise<void> {
    const parsed = removeAssessmentIssueSchema.safeParse(input);
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

    try {
      assessment.removeIssue(new AssessmentIssueId(input.issueId));
      await this.assessmentRepo.save(assessment);
    } catch (error) {
      if (error instanceof IllegalStateTransitionError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      if (error instanceof AssessmentValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      if (error instanceof OptimisticLockError) {
        throw new UseCaseError('CONFLICT', error.message, error);
      }
      throw error;
    }
  }
}
