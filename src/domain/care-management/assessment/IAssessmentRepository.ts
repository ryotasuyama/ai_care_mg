import type { TenantId } from '@/domain/shared/TenantId';
import type { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { Assessment } from './Assessment';
import type { AssessmentId } from './AssessmentId';

export interface IAssessmentRepository {
  findById(id: AssessmentId, tenantId: TenantId): Promise<Assessment | null>;

  findByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment[]>;

  findAll(tenantId: TenantId): Promise<Assessment[]>;

  findLatestFinalizedByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment | null>;

  save(assessment: Assessment): Promise<void>;
}
