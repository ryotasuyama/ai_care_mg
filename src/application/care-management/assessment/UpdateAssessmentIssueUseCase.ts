import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentIssueId } from '@/domain/care-management/assessment/AssessmentIssueId';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import {
  ISSUE_CATEGORY_VALUES,
  ISSUE_PRIORITY_VALUES,
} from '@/domain/care-management/assessment/IssueCategory';
import { AssessmentValidationError } from '@/domain/care-management/assessment/AssessmentValidationError';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

export const updateAssessmentIssueSchema = z.object({
  assessmentId: z.string().uuid(),
  issueId: z.string().uuid(),
  category: z.enum(ISSUE_CATEGORY_VALUES).optional(),
  description: z.string().min(1).optional(),
  priority: z.enum(ISSUE_PRIORITY_VALUES).optional(),
});

export type UpdateAssessmentIssueInput = {
  auth: AuthorizationContext;
} & z.infer<typeof updateAssessmentIssueSchema>;

export class UpdateAssessmentIssueUseCase
  implements IUseCase<UpdateAssessmentIssueInput, void>
{
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: UpdateAssessmentIssueInput): Promise<void> {
    const parsed = updateAssessmentIssueSchema.safeParse(input);
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
      assessment.updateIssue(new AssessmentIssueId(input.issueId), (issue) => {
        if (input.category) issue.updateCategory(input.category);
        if (input.priority) issue.updatePriority(input.priority);
        if (input.description) issue.updateDescription(input.description);
      });
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
