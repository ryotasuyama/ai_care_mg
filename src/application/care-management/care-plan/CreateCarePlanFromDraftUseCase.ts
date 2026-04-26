import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import { CarePlan } from '@/domain/care-management/care-plan/CarePlan';
import { LongTermGoal } from '@/domain/care-management/care-plan/LongTermGoal';
import { ShortTermGoal } from '@/domain/care-management/care-plan/ShortTermGoal';
import { ServiceItem } from '@/domain/care-management/care-plan/ServiceItem';
import { PlanPeriod } from '@/domain/care-management/care-plan/PlanPeriod';
import { CarePlanValidationError } from '@/domain/care-management/care-plan/CarePlanValidationError';

export const createCarePlanFromDraftSchema = z.object({
  assessmentId: z.string().uuid(),
  planNumber: z.string().min(1),
  planPeriodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  planPeriodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  longTermGoals: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        targetPeriodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        targetPeriodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .min(1),
  shortTermGoals: z
    .array(
      z.object({
        parentLongTermGoalIndex: z.number().int().min(0),
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        targetPeriodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        targetPeriodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .min(1),
  serviceItems: z
    .array(
      z.object({
        relatedShortTermGoalIndex: z.number().int().min(0).nullable().optional(),
        serviceType: z.string().min(1),
        serviceName: z.string().min(1),
        frequencyText: z.string().nullable().optional(),
        frequencyPerWeek: z.number().int().nullable().optional(),
        providerName: z.string().nullable().optional(),
        remarks: z.string().nullable().optional(),
      }),
    )
    .optional(),
});

export type CreateCarePlanFromDraftInput = {
  auth: AuthorizationContext;
} & z.infer<typeof createCarePlanFromDraftSchema>;

export interface CreateCarePlanFromDraftOutput {
  carePlanId: string;
}

export class CreateCarePlanFromDraftUseCase
  implements IUseCase<CreateCarePlanFromDraftInput, CreateCarePlanFromDraftOutput>
{
  constructor(
    private readonly assessmentRepo: IAssessmentRepository,
    private readonly carePlanRepo: ICarePlanRepository,
  ) {}

  async execute(input: CreateCarePlanFromDraftInput): Promise<CreateCarePlanFromDraftOutput> {
    const parsed = createCarePlanFromDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    // 1. Finalized アセスメント検証
    const assessment = await this.assessmentRepo.findById(
      new AssessmentId(input.assessmentId),
      tenantId,
    );
    if (!assessment) {
      throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');
    }
    if (assessment.status !== AssessmentStatus.Finalized) {
      throw new UseCaseError(
        'INVALID_INPUT',
        'ケアプランは Finalized アセスメントを根拠とする必要があります',
      );
    }

    // 2. ドメインオブジェクトを構築
    const planPeriod = PlanPeriod.create(new Date(input.planPeriodFrom), new Date(input.planPeriodTo));

    const longTermGoals = input.longTermGoals.map((g, idx) =>
      LongTermGoal.create({
        sequenceNo: idx + 1,
        title: g.title,
        description: g.description ?? null,
        targetPeriod: PlanPeriod.create(
          new Date(g.targetPeriodFrom),
          new Date(g.targetPeriodTo),
        ),
      }),
    );

    const shortTermGoals = input.shortTermGoals.map((g, idx) => {
      const parent = longTermGoals[g.parentLongTermGoalIndex];
      if (!parent) {
        throw new UseCaseError('INVALID_INPUT', '短期目標の親長期目標 index が不正です');
      }
      return ShortTermGoal.create({
        parentLongTermGoalId: parent.id,
        sequenceNo: idx + 1,
        title: g.title,
        description: g.description ?? null,
        targetPeriod: PlanPeriod.create(
          new Date(g.targetPeriodFrom),
          new Date(g.targetPeriodTo),
        ),
      });
    });

    const serviceItems = (input.serviceItems ?? []).map((s, idx) => {
      let relatedId = null;
      if (s.relatedShortTermGoalIndex !== null && s.relatedShortTermGoalIndex !== undefined) {
        const parent = shortTermGoals[s.relatedShortTermGoalIndex];
        if (!parent) {
          throw new UseCaseError(
            'INVALID_INPUT',
            'サービス項目の関連短期目標 index が不正です',
          );
        }
        relatedId = parent.id;
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

    let plan: CarePlan;
    try {
      plan = CarePlan.create({
        tenantId,
        careRecipientId: assessment.careRecipientId,
        assessmentId: assessment.id,
        planNumber: input.planNumber,
        planPeriod,
        longTermGoals,
        shortTermGoals,
        serviceItems,
        createdBy: userId,
      });
    } catch (error) {
      if (error instanceof CarePlanValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      throw error;
    }

    await this.carePlanRepo.save(plan);
    return { carePlanId: plan.id.value };
  }
}
