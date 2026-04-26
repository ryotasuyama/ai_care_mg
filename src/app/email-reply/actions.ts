'use server';

import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { DraftEmailReplyOutput } from '@/application/communication/DraftEmailReplyUseCase';

export interface DraftEmailReplyActionResult {
  result?: DraftEmailReplyOutput;
  error?: string;
}

export async function draftEmailReplyAction(
  formData: FormData,
): Promise<DraftEmailReplyActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  try {
    const result = await container.draftEmailReplyUseCase.execute({
      auth,
      incomingEmailBody: (formData.get('incomingEmailBody') as string) ?? '',
      intent: (formData.get('intent') as string) || undefined,
    });
    return { result };
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
}
