import type { Assessment } from '@/domain/care-management/assessment/Assessment';
import type { AssessmentViewDto } from './AssessmentViewDto';

export function toAssessmentViewDto(assessment: Assessment): AssessmentViewDto {
  return {
    id: assessment.id.value,
    careRecipientId: assessment.careRecipientId.value,
    type: assessment.type,
    status: assessment.status,
    conductedAt: toDateOnly(assessment.conductedAt),
    summary: assessment.getUnmaskedSummary(),
    issues: assessment.issues
      .slice()
      .sort((a, b) => a.sequenceNo - b.sequenceNo)
      .map((i) => ({
        id: i.id.value,
        sequenceNo: i.sequenceNo,
        category: i.category,
        description: assessment.getUnmaskedIssueDescription(i.id),
        priority: i.priority,
      })),
    createdAt: assessment.createdAt.toISOString(),
    updatedAt: assessment.updatedAt.toISOString(),
    finalizedAt: assessment.finalizedAt ? assessment.finalizedAt.toISOString() : null,
    version: assessment.version,
  };
}

function toDateOnly(d: Date): string {
  const [datePart] = d.toISOString().split('T');
  return datePart!;
}
