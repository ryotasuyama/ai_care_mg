import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { CarePlanId } from '@/domain/care-management/care-plan/CarePlanId';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import { LongTermGoal } from '@/domain/care-management/care-plan/LongTermGoal';
import { LongTermGoalId } from '@/domain/care-management/care-plan/LongTermGoalId';
import { ShortTermGoal } from '@/domain/care-management/care-plan/ShortTermGoal';
import { ShortTermGoalId } from '@/domain/care-management/care-plan/ShortTermGoalId';
import { ServiceItem } from '@/domain/care-management/care-plan/ServiceItem';
import { ServiceItemId } from '@/domain/care-management/care-plan/ServiceItemId';
import { PlanPeriod } from '@/domain/care-management/care-plan/PlanPeriod';
import { CarePlanValidationError } from '@/domain/care-management/care-plan/CarePlanValidationError';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const goalSchema = z.object({
  id: z.string().uuid().optional(), // 既存IDがある場合は維持
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  targetPeriodFrom: z.string().regex(datePattern),
  targetPeriodTo: z.string().regex(datePattern),
});

const shortTermSchema = goalSchema.extend({
  parentLongTermGoalIndex: z.number().int().min(0),
});

const serviceSchema = z.object({
  id: z.string().uuid().optional(),
  relatedShortTermGoalIndex: z.number().int().min(0).nullable().optional(),
  serviceType: z.string().min(1),
  serviceName: z.string().min(1),
  frequencyText: z.string().nullable().optional(),
  frequencyPerWeek: z.number().int().nullable().optional(),
  providerName: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
});

export const updateCarePlanSchema = z.object({
  carePlanId: z.string().uuid(),
  planNumber: z.string().min(1).optional(),
  planPeriodFrom: z.string().regex(datePattern).optional(),
  planPeriodTo: z.string().regex(datePattern).optional(),
  longTermGoals: z.array(goalSchema).min(1),
  shortTermGoals: z.array(shortTermSchema).min(1),
  serviceItems: z.array(serviceSchema),
});

export type UpdateCarePlanInput = {
  auth: AuthorizationContext;
} & z.infer<typeof updateCarePlanSchema>;

/**
 * シンプルな全置換型 Update。
 * 既存子エンティティの ID を維持したい場合は payload に id を入れる。id 省略時は新規作成扱い。
 */
export class UpdateCarePlanUseCase implements IUseCase<UpdateCarePlanInput, void> {
  constructor(private readonly repo: ICarePlanRepository) {}

  async execute(input: UpdateCarePlanInput): Promise<void> {
    const parsed = updateCarePlanSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const plan = await this.repo.findById(new CarePlanId(input.carePlanId), tenantId);
    if (!plan) throw new UseCaseError('NOT_FOUND', 'ケアプランが見つかりません');

    try {
      // 1. 計画期間 / プラン番号
      if (input.planPeriodFrom && input.planPeriodTo) {
        plan.updatePlanPeriod(
          PlanPeriod.create(new Date(input.planPeriodFrom), new Date(input.planPeriodTo)),
        );
      }
      if (input.planNumber) {
        plan.updatePlanNumber(input.planNumber);
      }

      // 2. 既存の子を全て差し替え (ID 永続性のため、payload に id があれば再利用)
      // 集約 API には「全部入れ替え」が無いので、手で先に削除→追加。
      // ただし「最低 1 件」不変条件があるため、まず構築してから入れ替える。
      const newLongs = input.longTermGoals.map((g, idx) => {
        const tp = PlanPeriod.create(new Date(g.targetPeriodFrom), new Date(g.targetPeriodTo));
        if (g.id) {
          return LongTermGoal.reconstruct({
            id: new LongTermGoalId(g.id),
            sequenceNo: idx + 1,
            title: g.title,
            description: g.description ?? null,
            targetPeriod: tp,
          });
        }
        return LongTermGoal.create({
          sequenceNo: idx + 1,
          title: g.title,
          description: g.description ?? null,
          targetPeriod: tp,
        });
      });

      const newShorts = input.shortTermGoals.map((g, idx) => {
        const parent = newLongs[g.parentLongTermGoalIndex];
        if (!parent) {
          throw new CarePlanValidationError('短期目標の親長期目標が不正です');
        }
        const tp = PlanPeriod.create(new Date(g.targetPeriodFrom), new Date(g.targetPeriodTo));
        if (g.id) {
          return ShortTermGoal.reconstruct({
            id: new ShortTermGoalId(g.id),
            parentLongTermGoalId: parent.id,
            sequenceNo: idx + 1,
            title: g.title,
            description: g.description ?? null,
            targetPeriod: tp,
          });
        }
        return ShortTermGoal.create({
          parentLongTermGoalId: parent.id,
          sequenceNo: idx + 1,
          title: g.title,
          description: g.description ?? null,
          targetPeriod: tp,
        });
      });

      const newServices = input.serviceItems.map((s, idx) => {
        let relatedId = null;
        if (s.relatedShortTermGoalIndex !== null && s.relatedShortTermGoalIndex !== undefined) {
          const parent = newShorts[s.relatedShortTermGoalIndex];
          if (!parent) throw new CarePlanValidationError('関連短期目標が不正です');
          relatedId = parent.id;
        }
        if (s.id) {
          return ServiceItem.reconstruct({
            id: new ServiceItemId(s.id),
            relatedShortTermGoalId: relatedId,
            sequenceNo: idx + 1,
            serviceType: s.serviceType,
            serviceName: s.serviceName,
            frequencyText: s.frequencyText ?? null,
            frequencyPerWeek: s.frequencyPerWeek ?? null,
            providerName: s.providerName ?? null,
            remarks: s.remarks ?? null,
          });
        }
        return ServiceItem.create({
          relatedShortTermGoalId: relatedId,
          sequenceNo: idx + 1,
          serviceType: s.serviceType,
          serviceName: s.serviceName,
          frequencyText: s.frequencyText ?? null,
          frequencyPerWeek: s.frequencyPerWeek ?? null,
          providerName: s.providerName ?? null,
          remarks: s.remarks ?? null,
        });
      });

      // 既存をすべて削除 (集約のチェックを通すため、新しいものを先に追加して旧を削除)
      // 集約は削除メソッドで「最低 1 件」を強制するので、addAll → removeAll の順で安全に入れ替え。
      // 実装簡素化のため、private 配列を直接置き換える代わりに「いったん新規IDのものを足し、古いIDを消す」。
      // ここでは payload に既存IDを含める設計のため、新しい配列で「同じIDが含まれる/含まれない」を判定し、削除→追加でなく
      // 「全削除→全追加」を集約のメソッドで行うのは不変条件で困難。簡略のため「再構築して save」の戦略を取る。

      // → CarePlan.reconstruct を再利用する: status/version は維持
      const rebuilt = (plan.constructor as typeof import('@/domain/care-management/care-plan/CarePlan').CarePlan).reconstruct(
        {
          id: plan.id,
          tenantId: plan.tenantId,
          careRecipientId: plan.careRecipientId,
          assessmentId: plan.assessmentId,
          planNumber: input.planNumber ?? plan.planNumber,
          planPeriod: plan.planPeriod,
          longTermGoals: newLongs,
          shortTermGoals: newShorts,
          serviceItems: newServices,
          status: plan.status,
          createdBy: plan.createdBy,
          createdAt: plan.createdAt,
          updatedAt: new Date(),
          finalizedAt: plan.finalizedAt,
          version: plan.version,
        },
      );

      // Draft 限定 (assertEditable は private なので updatePlanNumber を経由して検証)
      if (plan.status !== 'draft') {
        throw new IllegalStateTransitionError(
          plan.status,
          'edit',
          `編集可能なのは Draft 状態のみです。現在: ${plan.status}`,
        );
      }

      await this.repo.save(rebuilt);
    } catch (error) {
      if (error instanceof IllegalStateTransitionError)
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      if (error instanceof CarePlanValidationError)
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      if (error instanceof OptimisticLockError)
        throw new UseCaseError('CONFLICT', error.message, error);
      throw error;
    }
  }
}
