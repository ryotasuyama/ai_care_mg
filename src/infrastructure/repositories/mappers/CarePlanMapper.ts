import { CarePlan } from '@/domain/care-management/care-plan/CarePlan';
import { CarePlanId } from '@/domain/care-management/care-plan/CarePlanId';
import { LongTermGoal } from '@/domain/care-management/care-plan/LongTermGoal';
import { LongTermGoalId } from '@/domain/care-management/care-plan/LongTermGoalId';
import { ShortTermGoal } from '@/domain/care-management/care-plan/ShortTermGoal';
import { ShortTermGoalId } from '@/domain/care-management/care-plan/ShortTermGoalId';
import { ServiceItem } from '@/domain/care-management/care-plan/ServiceItem';
import { ServiceItemId } from '@/domain/care-management/care-plan/ServiceItemId';
import { PlanPeriod } from '@/domain/care-management/care-plan/PlanPeriod';
import type { CarePlanStatus } from '@/domain/care-management/care-plan/CarePlanStatus';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import type { Database } from '@/types/database';

type PlanRow = Database['public']['Tables']['care_plans']['Row'];
type LtgRow = Database['public']['Tables']['care_plan_long_term_goals']['Row'];
type StgRow = Database['public']['Tables']['care_plan_short_term_goals']['Row'];
type SvcRow = Database['public']['Tables']['care_plan_service_items']['Row'];

export interface SaveCarePlanPayload {
  plan: {
    id: string;
    tenant_id: string;
    care_recipient_id: string;
    assessment_id: string;
    plan_number: string;
    plan_period_from: string;
    plan_period_to: string;
    status: CarePlanStatus;
    created_by: string;
    created_at: string;
    updated_at: string;
    finalized_at: string | null;
    version: number;
  };
  long_term_goals: Array<{
    id: string;
    sequence_no: number;
    title: string;
    description: string | null;
    target_period_from: string;
    target_period_to: string;
  }>;
  short_term_goals: Array<{
    id: string;
    parent_long_term_goal_id: string;
    sequence_no: number;
    title: string;
    description: string | null;
    target_period_from: string;
    target_period_to: string;
  }>;
  service_items: Array<{
    id: string;
    related_short_term_goal_id: string | null;
    sequence_no: number;
    service_type: string;
    service_name: string;
    frequency_text: string | null;
    frequency_per_week: number | null;
    provider_name: string | null;
    remarks: string | null;
  }>;
}

function toDateOnly(d: Date): string {
  const [datePart] = d.toISOString().split('T');
  return datePart!;
}

export class CarePlanMapper {
  static toDomain(rows: {
    plan: PlanRow;
    longTermGoals: LtgRow[];
    shortTermGoals: StgRow[];
    serviceItems: SvcRow[];
  }): CarePlan {
    const longTerms = rows.longTermGoals
      .slice()
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((r) =>
        LongTermGoal.reconstruct({
          id: new LongTermGoalId(r.id),
          sequenceNo: r.sequence_no,
          title: r.title,
          description: r.description,
          targetPeriod: PlanPeriod.reconstruct(new Date(r.target_period_from), new Date(r.target_period_to)),
        }),
      );

    const shortTerms = rows.shortTermGoals
      .slice()
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((r) =>
        ShortTermGoal.reconstruct({
          id: new ShortTermGoalId(r.id),
          parentLongTermGoalId: new LongTermGoalId(r.parent_long_term_goal_id),
          sequenceNo: r.sequence_no,
          title: r.title,
          description: r.description,
          targetPeriod: PlanPeriod.reconstruct(new Date(r.target_period_from), new Date(r.target_period_to)),
        }),
      );

    const services = rows.serviceItems
      .slice()
      .sort((a, b) => a.sequence_no - b.sequence_no)
      .map((r) =>
        ServiceItem.reconstruct({
          id: new ServiceItemId(r.id),
          relatedShortTermGoalId: r.related_short_term_goal_id
            ? new ShortTermGoalId(r.related_short_term_goal_id)
            : null,
          sequenceNo: r.sequence_no,
          serviceType: r.service_type,
          serviceName: r.service_name,
          frequencyText: r.frequency_text,
          frequencyPerWeek: r.frequency_per_week,
          providerName: r.provider_name,
          remarks: r.remarks,
        }),
      );

    return CarePlan.reconstruct({
      id: new CarePlanId(rows.plan.id),
      tenantId: new TenantId(rows.plan.tenant_id),
      careRecipientId: new CareRecipientId(rows.plan.care_recipient_id),
      assessmentId: new AssessmentId(rows.plan.assessment_id),
      planNumber: rows.plan.plan_number,
      planPeriod: PlanPeriod.reconstruct(
        new Date(rows.plan.plan_period_from),
        new Date(rows.plan.plan_period_to),
      ),
      longTermGoals: longTerms,
      shortTermGoals: shortTerms,
      serviceItems: services,
      status: rows.plan.status,
      createdBy: new UserId(rows.plan.created_by),
      createdAt: new Date(rows.plan.created_at),
      updatedAt: new Date(rows.plan.updated_at),
      finalizedAt: rows.plan.finalized_at ? new Date(rows.plan.finalized_at) : null,
      version: rows.plan.version,
    });
  }

  static toPersistence(plan: CarePlan): SaveCarePlanPayload {
    return {
      plan: {
        id: plan.id.value,
        tenant_id: plan.tenantId.value,
        care_recipient_id: plan.careRecipientId.value,
        assessment_id: plan.assessmentId.value,
        plan_number: plan.planNumber,
        plan_period_from: toDateOnly(plan.planPeriod.from),
        plan_period_to: toDateOnly(plan.planPeriod.to),
        status: plan.status,
        created_by: plan.createdBy.value,
        created_at: plan.createdAt.toISOString(),
        updated_at: plan.updatedAt.toISOString(),
        finalized_at: plan.finalizedAt ? plan.finalizedAt.toISOString() : null,
        version: plan.version,
      },
      long_term_goals: plan.longTermGoals.map((g) => ({
        id: g.id.value,
        sequence_no: g.sequenceNo,
        title: g.title,
        description: g.description,
        target_period_from: toDateOnly(g.targetPeriod.from),
        target_period_to: toDateOnly(g.targetPeriod.to),
      })),
      short_term_goals: plan.shortTermGoals.map((g) => ({
        id: g.id.value,
        parent_long_term_goal_id: g.parentLongTermGoalId.value,
        sequence_no: g.sequenceNo,
        title: g.title,
        description: g.description,
        target_period_from: toDateOnly(g.targetPeriod.from),
        target_period_to: toDateOnly(g.targetPeriod.to),
      })),
      service_items: plan.serviceItems.map((s) => ({
        id: s.id.value,
        related_short_term_goal_id: s.relatedShortTermGoalId?.value ?? null,
        sequence_no: s.sequenceNo,
        service_type: s.serviceType,
        service_name: s.serviceName,
        frequency_text: s.frequencyText,
        frequency_per_week: s.frequencyPerWeek,
        provider_name: s.providerName,
        remarks: s.remarks,
      })),
    };
  }
}
