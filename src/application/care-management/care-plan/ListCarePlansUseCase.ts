import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import type { CarePlanStatus } from '@/domain/care-management/care-plan/CarePlanStatus';

export const listCarePlansSchema = z.object({
  careRecipientId: z.string().uuid(),
});

export type ListCarePlansInput = {
  auth: AuthorizationContext;
} & z.infer<typeof listCarePlansSchema>;

export interface CarePlanSummaryDto {
  id: string;
  planNumber: string;
  planPeriodFrom: string;
  planPeriodTo: string;
  status: CarePlanStatus;
  finalizedAt: string | null;
}

function toDateOnly(d: Date): string {
  const [datePart] = d.toISOString().split('T');
  return datePart!;
}

export class ListCarePlansUseCase
  implements IUseCase<ListCarePlansInput, CarePlanSummaryDto[]>
{
  constructor(private readonly repo: ICarePlanRepository) {}

  async execute(input: ListCarePlansInput): Promise<CarePlanSummaryDto[]> {
    const parsed = listCarePlansSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const tenantId = new TenantId(input.auth.tenantId);
    const recipientId = new CareRecipientId(input.careRecipientId);
    const plans = await this.repo.findByRecipient(recipientId, tenantId);
    return plans.map((p) => ({
      id: p.id.value,
      planNumber: p.planNumber,
      planPeriodFrom: toDateOnly(p.planPeriod.from),
      planPeriodTo: toDateOnly(p.planPeriod.to),
      status: p.status,
      finalizedAt: p.finalizedAt ? p.finalizedAt.toISOString() : null,
    }));
  }
}
