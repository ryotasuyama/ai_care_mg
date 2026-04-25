'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';

type ActionResult = { error?: string };

export async function registerCareRecipientAction(formData: FormData): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  const familyMembers = parseFamilyMembers(formData);

  try {
    await container.registerCareRecipientUseCase.execute({
      auth,
      fullName: formData.get('fullName') as string,
      dateOfBirth: formData.get('dateOfBirth') as string,
      address: formData.get('address') as string,
      phoneNumber: (formData.get('phoneNumber') as string) || undefined,
      currentCareLevel: formData.get('currentCareLevel') as string as never,
      familyMembers,
    });
  } catch (error) {
    if (error instanceof UseCaseError) {
      return { error: error.message };
    }
    return { error: '予期しないエラーが発生しました' };
  }

  revalidatePath('/care-recipients');
  redirect('/care-recipients');
}

export async function updateCareRecipientAction(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  const familyMembers = parseFamilyMembers(formData);

  try {
    await container.updateCareRecipientUseCase.execute({
      auth,
      id,
      fullName: (formData.get('fullName') as string) || undefined,
      address: (formData.get('address') as string) || undefined,
      phoneNumber: formData.get('phoneNumber') as string | null,
      currentCareLevel: formData.get('currentCareLevel') as string as never,
      familyMembers,
    });
  } catch (error) {
    if (error instanceof UseCaseError) {
      return { error: error.message };
    }
    return { error: '予期しないエラーが発生しました' };
  }

  revalidatePath(`/care-recipients/${id}`);
  revalidatePath('/care-recipients');
  redirect(`/care-recipients/${id}`);
}

function parseFamilyMembers(formData: FormData) {
  const raw = formData.get('familyMembers') as string;
  if (!raw) return [];
  try {
    return JSON.parse(raw) as { name: string; relation: string; phoneNumber?: string }[];
  } catch {
    return [];
  }
}
