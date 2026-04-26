import type { TenantId } from '@/domain/shared/TenantId';
import type { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { CarePlan } from './CarePlan';
import type { CarePlanId } from './CarePlanId';

export interface ICarePlanRepository {
  findById(id: CarePlanId, tenantId: TenantId): Promise<CarePlan | null>;

  findByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<CarePlan[]>;

  findActiveByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
    today: Date,
  ): Promise<CarePlan | null>;

  save(carePlan: CarePlan): Promise<void>;

  saveSuccessor(newPlan: CarePlan, predecessorId: CarePlanId): Promise<void>;
}
