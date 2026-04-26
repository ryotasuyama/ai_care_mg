'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';

type ActionResult = { error?: string; success?: boolean };

function refresh(recipientId: string, carePlanId: string) {
  revalidatePath(`/care-recipients/${recipientId}/care-plans`);
  revalidatePath(`/care-recipients/${recipientId}/care-plans/${carePlanId}`);
}

export async function finalizeCarePlanAction(
  recipientId: string,
  carePlanId: string,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.finalizeCarePlanUseCase.execute({ auth, carePlanId });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(recipientId, carePlanId);
  return { success: true };
}

export async function archiveCarePlanAction(
  recipientId: string,
  carePlanId: string,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.archiveCarePlanUseCase.execute({ auth, carePlanId });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(recipientId, carePlanId);
  return { success: true };
}

export interface UpdateCarePlanPayload {
  carePlanId: string;
  planNumber?: string;
  planPeriodFrom?: string;
  planPeriodTo?: string;
  longTermGoals: Array<{
    id?: string;
    title: string;
    description: string | null;
    targetPeriodFrom: string;
    targetPeriodTo: string;
  }>;
  shortTermGoals: Array<{
    id?: string;
    parentLongTermGoalIndex: number;
    title: string;
    description: string | null;
    targetPeriodFrom: string;
    targetPeriodTo: string;
  }>;
  serviceItems: Array<{
    id?: string;
    relatedShortTermGoalIndex: number | null;
    serviceType: string;
    serviceName: string;
    frequencyText: string | null;
    frequencyPerWeek: number | null;
    providerName: string | null;
    remarks: string | null;
  }>;
}

export async function updateCarePlanAction(
  recipientId: string,
  payload: UpdateCarePlanPayload,
): Promise<ActionResult> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  try {
    await container.updateCarePlanUseCase.execute({
      auth,
      ...payload,
    });
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  refresh(recipientId, payload.carePlanId);
  return { success: true };
}

export async function createSuccessorCarePlanAction(
  recipientId: string,
  predecessorCarePlanId: string,
  payload: {
    newPlanNumber: string;
    newPlanPeriodFrom: string;
    newPlanPeriodTo: string;
  },
): Promise<ActionResult & { carePlanId?: string }> {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  let newId: string;
  try {
    const result = await container.createSuccessorCarePlanUseCase.execute({
      auth,
      predecessorCarePlanId,
      ...payload,
    });
    newId = result.carePlanId;
  } catch (error) {
    if (error instanceof UseCaseError) return { error: error.message };
    return { error: '予期しないエラーが発生しました' };
  }
  revalidatePath(`/care-recipients/${recipientId}/care-plans`);
  redirect(`/care-recipients/${recipientId}/care-plans/${newId}`);
}
