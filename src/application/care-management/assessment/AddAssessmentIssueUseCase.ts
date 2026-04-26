import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import {
  ISSUE_CATEGORY_VALUES,
  ISSUE_PRIORITY_VALUES,
} from '@/domain/care-management/assessment/IssueCategory';
import { AssessmentValidationError } from '@/domain/care-management/assessment/AssessmentValidationError';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

export const addAssessmentIssueSchema = z.object({
  assessmentId: z.string().uuid(),
  category: z.enum(ISSUE_CATEGORY_VALUES),
  description: z.string().min(1, '課題の説明は必須です'),
  priority: z.enum(ISSUE_PRIORITY_VALUES),
});

export type AddAssessmentIssueInput = {
  auth: AuthorizationContext;
} & z.infer<typeof addAssessmentIssueSchema>;

export class AddAssessmentIssueUseCase
  implements IUseCase<AddAssessmentIssueInput, { issueId: string }>
{
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: AddAssessmentIssueInput): Promise<{ issueId: string }> {
    const parsed = addAssessmentIssueSchema.safeParse(input);
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

    const nextSeq = assessment.issues.reduce((max, i) => Math.max(max, i.sequenceNo), 0) + 1;
    const issue = AssessmentIssue.create({
      category: input.category,
      description: input.description,
      priority: input.priority,
      sequenceNo: nextSeq,
    });

    try {
      assessment.addIssue(issue);
      await this.assessmentRepo.save(assessment);
    } catch (error) {
      throw mapDomainError(error);
    }

    return { issueId: issue.id.value };
  }
}

function mapDomainError(error: unknown): UseCaseError {
  if (error instanceof IllegalStateTransitionError) {
    return new UseCaseError('INVALID_INPUT', error.message, error);
  }
  if (error instanceof AssessmentValidationError) {
    return new UseCaseError('INVALID_INPUT', error.message, error);
  }
  if (error instanceof OptimisticLockError) {
    return new UseCaseError('CONFLICT', error.message, error);
  }
  if (error instanceof UseCaseError) return error;
  return new UseCaseError('INTERNAL_ERROR', '更新に失敗しました', error);
}
