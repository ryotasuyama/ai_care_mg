import type { CareRecipient } from '@/domain/care-management/care-recipient/CareRecipient';
import type { CareRecipientDto } from './CareRecipientDto';

export function toCareRecipientDto(r: CareRecipient): CareRecipientDto {
  return {
    id: r.id.value,
    tenantId: r.tenantId.value,
    fullName: r.fullName,
    dateOfBirth: r.dateOfBirth.toISOString().split('T')[0]!,
    address: r.address,
    phoneNumber: r.phoneNumber,
    currentCareLevel: r.currentCareLevel.value,
    careLevelLabel: r.currentCareLevel.label,
    ageRange: r.ageRange,
    familyMembers: r.familyMembers,
    createdBy: r.createdBy.value,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
