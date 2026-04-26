'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';

type ActionResult = { error?: string; success?: boolean };

export async function deleteKnowledgeAction(documentId: string): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.deleteKnowledgeDocumentUseCase.execute({ auth, documentId });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  revalidatePath('/knowledge');
  return { success: true };
}
