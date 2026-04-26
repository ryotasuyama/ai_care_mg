'use server';

import { redirect } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';

type ActionResult = { error?: string; draftId?: string };

export async function prepareAssessmentDraftAction(
  careRecipientId: string,
  formData: FormData,
): Promise<ActionResult> {
  const voiceTranscript = (formData.get('voiceTranscript') as string | null)?.trim() ?? '';
  if (!voiceTranscript) {
    return { error: '音声原文を入力してください' };
  }

  const auth = await getCurrentAuth();
  const container = await buildContainer();

  let draftId: string;
  try {
    const result = await container.prepareAssessmentDraftUseCase.execute({
      auth,
      careRecipientId,
      voiceTranscript,
    });
    draftId = result.draftId;
  } catch (error) {
    if (error instanceof UseCaseError) {
      return { error: error.message };
    }
    return { error: '予期しないエラーが発生しました' };
  }

  redirect(`/care-recipients/${careRecipientId}/assessments/new/preview/${draftId}`);
}
