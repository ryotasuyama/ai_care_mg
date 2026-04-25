import { CareRecipient, type FamilyMember } from '@/domain/care-management/care-recipient/CareRecipient';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { CareLevel } from '@/domain/care-management/care-recipient/CareLevel';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import type { Database } from '@/types/database';

type CareRecipientRow = Database['public']['Tables']['care_recipients']['Row'];

export class CareRecipientMapper {
  static toDomain(row: CareRecipientRow): CareRecipient {
    const familyMembers = (Array.isArray(row.family_members) ? row.family_members : []) as unknown as FamilyMember[];
    return CareRecipient.reconstruct({
      id: new CareRecipientId(row.id),
      tenantId: new TenantId(row.tenant_id),
      fullName: row.full_name,
      dateOfBirth: new Date(row.date_of_birth),
      address: row.address,
      phoneNumber: row.phone_number,
      currentCareLevel: CareLevel.of(row.current_care_level),
      familyMembers,
      createdBy: new UserId(row.created_by),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    });
  }

  static toInsertRow(
    recipient: CareRecipient,
  ): Database['public']['Tables']['care_recipients']['Insert'] {
    return {
      id: recipient.id.value,
      tenant_id: recipient.tenantId.value,
      full_name: recipient.fullName,
      date_of_birth: recipient.dateOfBirth.toISOString().split('T')[0]!,
      address: recipient.address,
      phone_number: recipient.phoneNumber,
      family_members: recipient.familyMembers as unknown as Database['public']['Tables']['care_recipients']['Insert']['family_members'],
      current_care_level: recipient.currentCareLevel.value,
      created_by: recipient.createdBy.value,
    };
  }

  static toUpdateRow(
    recipient: CareRecipient,
  ): Database['public']['Tables']['care_recipients']['Update'] {
    return {
      full_name: recipient.fullName,
      address: recipient.address,
      phone_number: recipient.phoneNumber,
      family_members: recipient.familyMembers as unknown as Database['public']['Tables']['care_recipients']['Update']['family_members'],
      current_care_level: recipient.currentCareLevel.value,
      updated_at: recipient.updatedAt.toISOString(),
    };
  }
}
