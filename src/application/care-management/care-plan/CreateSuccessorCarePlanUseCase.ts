import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CarePlanId } from '@/domain/care-management/care-plan/CarePlanId';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import { CarePlan } from '@/domain/care-management/care-plan/CarePlan';
import { LongTermGoal } from '@/domain/care-management/care-plan/LongTermGoal';
import { ShortTermGoal } from '@/domain/care-management/care-plan/ShortTermGoal';
import { ServiceItem } from '@/domain/care-management/care-plan/ServiceItem';
import { PlanPeriod } from '@/domain/care-management/care-plan/PlanPeriod';
import { CarePlanStatus } from '@/domain/care-management/care-plan/CarePlanStatus';
import { CarePlanValidationError } from '@/domain/care-management/care-plan/CarePlanValidationError';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const createSuccessorCarePlanSchema = z.object({
  predecessorCarePlanId: z.string().uuid(),
  newPlanNumber: z.string().min(1),
  newPlanPeriodFrom: z.string().regex(datePattern),
  newPlanPeriodTo: z.string().regex(datePattern),
});

export type CreateSuccessorCarePlanInput = {
  auth: AuthorizationContext;
} & z.infer<typeof createSuccessorCarePlanSchema>;

export class CreateSuccessorCarePlanUseCase
  implements IUseCase<CreateSuccessorCarePlanInput, { carePlanId: string }>
{
  constructor(private readonly repo: ICarePlanRepository) {}

  async execute(input: CreateSuccessorCarePlanInput): Promise<{ carePlanId: string }> {
    const parsed = createSuccessorCarePlanSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    const predecessor = await this.repo.findById(
      new CarePlanId(input.predecessorCarePlanId),
      tenantId,
    );
    if (!predecessor) {
      throw new UseCaseError('NOT_FOUND', '前ケアプランが見つかりません');
    }
    if (predecessor.status !== CarePlanStatus.Finalized) {
      throw new UseCaseError(
        'INVALID_INPUT',
        '後継プランは確定済みプランに対してのみ作成できます',
      );
    }

    const newPeriod = PlanPeriod.create(
      new Date(input.newPlanPeriodFrom),
      new Date(input.newPlanPeriodTo),
    );
    if (!(newPeriod.from > predecessor.planPeriod.to)) {
      throw new UseCaseError(
        'INVALID_INPUT',
        '新計画期間は前プランの終了日の翌日以降にしてください',
      );
    }

    // 前プランの内容をコピー (新ID で再生成)
    const newLongs = predecessor.longTermGoals.map((g) =>
      LongTermGoal.create({
        sequenceNo: g.sequenceNo,
        title: g.title,
        description: g.description,
        targetPeriod: g.targetPeriod,
      }),
    );
    const longIdByPredecessorIndex = new Map<string, ReturnType<typeof predecessor.longTermGoals[0]['id']['toString']>>();
    predecessor.longTermGoals.forEach((g, idx) => {
      longIdByPredecessorIndex.set(g.id.value, newLongs[idx]!.id.value);
    });

    const newShorts = predecessor.shortTermGoals.map((s) => {
      const newParentValue = longIdByPredecessorIndex.get(s.parentLongTermGoalId.value);
      const parent = newLongs.find((l) => l.id.value === newParentValue);
      if (!parent) {
        throw new CarePlanValidationError('後継プラン作成中に親長期目標が見つかりません');
      }
      return ShortTermGoal.create({
        parentLongTermGoalId: parent.id,
        sequenceNo: s.sequenceNo,
        title: s.title,
        description: s.description,
        targetPeriod: s.targetPeriod,
      });
    });

    const shortIdByPredecessorIndex = new Map<string, string>();
    predecessor.shortTermGoals.forEach((s, idx) => {
      shortIdByPredecessorIndex.set(s.id.value, newShorts[idx]!.id.value);
    });

    const newServices = predecessor.serviceItems.map((sv) => {
      let relatedId = null;
      if (sv.relatedShortTermGoalId) {
        const newId = shortIdByPredecessorIndex.get(sv.relatedShortTermGoalId.value);
        const target = newShorts.find((s) => s.id.value === newId);
        relatedId = target?.id ?? null;
      }
      return ServiceItem.create({
        relatedShortTermGoalId: relatedId,
        sequenceNo: sv.sequenceNo,
        serviceType: sv.serviceType,
        serviceName: sv.serviceName,
        frequencyText: sv.frequencyText,
        frequencyPerWeek: sv.frequencyPerWeek,
        providerName: sv.providerName,
        remarks: sv.remarks,
      });
    });

    let newPlan: CarePlan;
    try {
      newPlan = CarePlan.create({
        tenantId,
        careRecipientId: predecessor.careRecipientId,
        assessmentId: predecessor.assessmentId,
        planNumber: input.newPlanNumber,
        planPeriod: newPeriod,
        longTermGoals: newLongs,
        shortTermGoals: newShorts,
        serviceItems: newServices,
        createdBy: userId,
      });
    } catch (error) {
      if (error instanceof CarePlanValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      throw error;
    }

    await this.repo.saveSuccessor(newPlan, predecessor.id);

    return { carePlanId: newPlan.id.value };
  }
}
