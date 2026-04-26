import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { CarePlanId } from '@/domain/care-management/care-plan/CarePlanId';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import { toCarePlanViewDto } from './dto/toCarePlanViewDto';
import type { CarePlanViewDto } from './dto/CarePlanViewDto';

export const getCarePlanSchema = z.object({
  carePlanId: z.string().uuid(),
});

export type GetCarePlanInput = {
  auth: AuthorizationContext;
} & z.infer<typeof getCarePlanSchema>;

export class GetCarePlanForViewUseCase implements IUseCase<GetCarePlanInput, CarePlanViewDto> {
  constructor(private readonly repo: ICarePlanRepository) {}

  async execute(input: GetCarePlanInput): Promise<CarePlanViewDto> {
    const parsed = getCarePlanSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const tenantId = new TenantId(input.auth.tenantId);
    const plan = await this.repo.findById(new CarePlanId(input.carePlanId), tenantId);
    if (!plan) throw new UseCaseError('NOT_FOUND', 'ケアプランが見つかりません');
    return toCarePlanViewDto(plan);
  }
}
