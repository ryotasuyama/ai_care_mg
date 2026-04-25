export const AssessmentType = {
  Initial: 'initial',
  Reassessment: 'reassessment',
} as const;

export type AssessmentType = (typeof AssessmentType)[keyof typeof AssessmentType];

export const ASSESSMENT_TYPE_VALUES = ['initial', 'reassessment'] as const satisfies readonly AssessmentType[];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  initial: '初回',
  reassessment: '再アセスメント',
};
