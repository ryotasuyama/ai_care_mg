'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { AssessmentType } from '@/domain/care-management/assessment/AssessmentType';

type ActionResult = { error?: string };

export async function generateAssessmentAction(
  careRecipientId: string,
  draftId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  const approvedMaskedText = (formData.get('maskedText') as string | null) ?? '';
  const type = formData.get('type') as AssessmentType | null;
  const conductedAt = (formData.get('conductedAt') as string | null) ?? '';

  if (!type || (type !== 'initial' && type !== 'reassessment')) {
    return { error: 'アセスメント種別を選択してください' };
  }

  let assessmentId: string;
  try {
    const result = await container.generateAssessmentFromMaskedTextUseCase.execute({
      auth,
      draftId,
      approvedMaskedText,
      type,
      conductedAt,
    });
    assessmentId = result.assessmentId;
  } catch (error) {
    if (error instanceof UseCaseError) {
      return { error: error.message };
    }
    return { error: '予期しないエラーが発生しました' };
  }

  revalidatePath(`/care-recipients/${careRecipientId}/assessments`);
  revalidatePath('/assessments');
  redirect(`/care-recipients/${careRecipientId}/assessments/${assessmentId}`);
}
