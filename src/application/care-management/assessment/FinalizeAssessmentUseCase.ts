import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { AssessmentValidationError } from '@/domain/care-management/assessment/AssessmentValidationError';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

export const finalizeAssessmentSchema = z.object({
  assessmentId: z.string().uuid('IDが不正です'),
});

export type FinalizeAssessmentInput = {
  auth: AuthorizationContext;
} & z.infer<typeof finalizeAssessmentSchema>;

export class FinalizeAssessmentUseCase implements IUseCase<FinalizeAssessmentInput, void> {
  constructor(private readonly assessmentRepo: IAssessmentRepository) {}

  async execute(input: FinalizeAssessmentInput): Promise<void> {
    const parsed = finalizeAssessmentSchema.safeParse(input);
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
      assessment.finalize();
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
