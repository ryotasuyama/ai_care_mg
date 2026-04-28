'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';

export interface GenerateDraftResult {
  error?: string;
  draft?: Awaited<
    ReturnType<
      Awaited<ReturnType<typeof buildContainer>>['generateCarePlanDraftUseCase']['execute']
    >
  >;
}

export async function generateCarePlanDraftAction(
  assessmentId: string,
): Promise<GenerateDraftResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    const draft = await container.generateCarePlanDraftUseCase.execute({ auth, assessmentId });
    return { draft };
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    console.error('[generateCarePlanDraftAction] unexpected error:', error);
    return { error: '予期しないエラーが発生しました' };
  }
}

interface AdoptDraftPayload {
  recipientId: string;
  assessmentId: string;
  planNumber: string;
  planPeriodFrom: string;
  planPeriodTo: string;
  longTermGoals: Array<{
    title: string;
    description: string | null;
    targetPeriodFrom: string;
    targetPeriodTo: string;
  }>;
  shortTermGoals: Array<{
    parentLongTermGoalIndex: number;
    title: string;
    description: string | null;
    targetPeriodFrom: string;
    targetPeriodTo: string;
  }>;
  serviceItems: Array<{
    relatedShortTermGoalIndex: number | null;
    serviceType: string;
    serviceName: string;
    frequencyText: string | null;
    remarks: string | null;
  }>;
}

export async function adoptCarePlanDraftAction(
  payload: AdoptDraftPayload,
): Promise<{ error?: string }> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  let carePlanId: string;
  try {
    const result = await container.createCarePlanFromDraftUseCase.execute({
      auth,
      assessmentId: payload.assessmentId,
      planNumber: payload.planNumber,
      planPeriodFrom: payload.planPeriodFrom,
      planPeriodTo: payload.planPeriodTo,
      longTermGoals: payload.longTermGoals,
      shortTermGoals: payload.shortTermGoals,
      serviceItems: payload.serviceItems,
    });
    carePlanId = result.carePlanId;
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    console.error('[adoptCarePlanDraftAction] unexpected error:', error);
    return { error: '予期しないエラーが発生しました' };
  }
  revalidatePath(`/care-recipients/${payload.recipientId}/care-plans`);
  redirect(`/care-recipients/${payload.recipientId}/care-plans/${carePlanId}`);
}
