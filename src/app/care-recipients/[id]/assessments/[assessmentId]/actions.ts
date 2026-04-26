'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { IssueCategory, IssuePriority } from '@/domain/care-management/assessment/IssueCategory';

type ActionResult = { error?: string; success?: boolean };

function refresh(careRecipientId: string, assessmentId: string) {
  revalidatePath(`/care-recipients/${careRecipientId}/assessments/${assessmentId}`);
  revalidatePath(`/care-recipients/${careRecipientId}/assessments`);
  revalidatePath('/assessments');
}

export async function finalizeAssessmentAction(
  careRecipientId: string,
  assessmentId: string,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.finalizeAssessmentUseCase.execute({ auth, assessmentId });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(careRecipientId, assessmentId);
  return { success: true };
}

export async function addAssessmentIssueAction(
  careRecipientId: string,
  assessmentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.addAssessmentIssueUseCase.execute({
      auth,
      assessmentId,
      category: formData.get('category') as IssueCategory,
      description: (formData.get('description') as string) ?? '',
      priority: formData.get('priority') as IssuePriority,
    });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(careRecipientId, assessmentId);
  return { success: true };
}

export async function updateAssessmentIssueAction(
  careRecipientId: string,
  assessmentId: string,
  issueId: string,
  formData: FormData,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.updateAssessmentIssueUseCase.execute({
      auth,
      assessmentId,
      issueId,
      category: (formData.get('category') as IssueCategory) || undefined,
      description: (formData.get('description') as string) || undefined,
      priority: (formData.get('priority') as IssuePriority) || undefined,
    });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(careRecipientId, assessmentId);
  return { success: true };
}

export async function removeAssessmentIssueAction(
  careRecipientId: string,
  assessmentId: string,
  issueId: string,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.removeAssessmentIssueUseCase.execute({
      auth,
      assessmentId,
      issueId,
    });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(careRecipientId, assessmentId);
  return { success: true };
}
