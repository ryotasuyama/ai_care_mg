import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { CarePlanId } from '@/domain/care-management/care-plan/CarePlanId';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

export const archiveCarePlanSchema = z.object({
  carePlanId: z.string().uuid(),
});

export type ArchiveCarePlanInput = {
  auth: AuthorizationContext;
} & z.infer<typeof archiveCarePlanSchema>;

export class ArchiveCarePlanUseCase implements IUseCase<ArchiveCarePlanInput, void> {
  constructor(private readonly repo: ICarePlanRepository) {}

  async execute(input: ArchiveCarePlanInput): Promise<void> {
    const parsed = archiveCarePlanSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const tenantId = new TenantId(input.auth.tenantId);
    const plan = await this.repo.findById(new CarePlanId(input.carePlanId), tenantId);
    if (!plan) throw new UseCaseError('NOT_FOUND', 'ケアプランが見つかりません');

    try {
      plan.archive();
      await this.repo.save(plan);
    } catch (error) {
      if (error instanceof IllegalStateTransitionError)
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      if (error instanceof OptimisticLockError)
        throw new UseCaseError('CONFLICT', error.message, error);
      throw error;
    }
  }
}
