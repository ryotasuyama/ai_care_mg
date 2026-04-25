import type { CareLevelValue } from '@/domain/care-management/care-recipient/CareLevel';
import type { FamilyMember } from '@/domain/care-management/care-recipient/CareRecipient';

export interface CareRecipientDto {
  id: string;
  tenantId: string;
  fullName: string;
  dateOfBirth: string; // ISO date string
  address: string;
  phoneNumber: string | null;
  currentCareLevel: CareLevelValue;
  careLevelLabel: string;
  ageRange: string;
  familyMembers: FamilyMember[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
