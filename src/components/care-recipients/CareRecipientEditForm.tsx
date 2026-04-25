'use client';

import type { CareRecipientDto } from '@/application/care-management/care-recipient/dto/CareRecipientDto';
import { CareRecipientForm } from './CareRecipientForm';

interface Props {
  recipient: CareRecipientDto;
  action: (formData: FormData) => Promise<{ error?: string } | void | null>;
  submitLabel: string;
}

export function CareRecipientEditForm({ recipient, action, submitLabel }: Props) {
  return (
    <CareRecipientForm
      action={action}
      submitLabel={submitLabel}
      defaultValues={{
        fullName: recipient.fullName,
        dateOfBirth: recipient.dateOfBirth,
        address: recipient.address,
        phoneNumber: recipient.phoneNumber,
        currentCareLevel: recipient.currentCareLevel,
        familyMembers: recipient.familyMembers,
      }}
    />
  );
}
