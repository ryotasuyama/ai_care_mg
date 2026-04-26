export const AssessmentStatus = {
  Draft: 'draft',
  Finalized: 'finalized',
} as const;

export type AssessmentStatus = (typeof AssessmentStatus)[keyof typeof AssessmentStatus];

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: '下書き',
  finalized: '確定',
};
