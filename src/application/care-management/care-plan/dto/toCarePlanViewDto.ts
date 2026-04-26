import type { CarePlan } from '@/domain/care-management/care-plan/CarePlan';
import type { CarePlanViewDto } from './CarePlanViewDto';

function toDateOnly(d: Date): string {
  const [datePart] = d.toISOString().split('T');
  return datePart!;
}

export function toCarePlanViewDto(plan: CarePlan): CarePlanViewDto {
  return {
    id: plan.id.value,
    careRecipientId: plan.careRecipientId.value,
    assessmentId: plan.assessmentId.value,
    planNumber: plan.planNumber,
    planPeriodFrom: toDateOnly(plan.planPeriod.from),
    planPeriodTo: toDateOnly(plan.planPeriod.to),
    status: plan.status,
    longTermGoals: plan.longTermGoals
      .slice()
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((g) => ({
        id: g.id.value,
        sequenceNo: g.sequenceNo,
        title: g.title,
        description: g.description,
        targetPeriodFrom: toDateOnly(g.targetPeriod.from),
        targetPeriodTo: toDateOnly(g.targetPeriod.to),
      })),
    shortTermGoals: plan.shortTermGoals
      .slice()
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((g) => ({
        id: g.id.value,
        parentLongTermGoalId: g.parentLongTermGoalId.value,
        sequenceNo: g.sequenceNo,
        title: g.title,
        description: g.description,
        targetPeriodFrom: toDateOnly(g.targetPeriod.from),
        targetPeriodTo: toDateOnly(g.targetPeriod.to),
      })),
    serviceItems: plan.serviceItems
      .slice()
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((s) => ({
        id: s.id.value,
        relatedShortTermGoalId: s.relatedShortTermGoalId?.value ?? null,
        sequenceNo: s.sequenceNo,
        serviceType: s.serviceType,
        serviceName: s.serviceName,
        frequencyText: s.frequencyText,
        frequencyPerWeek: s.frequencyPerWeek,
        providerName: s.providerName,
        remarks: s.remarks,
      })),
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    finalizedAt: plan.finalizedAt ? plan.finalizedAt.toISOString() : null,
    version: plan.version,
  };
}
