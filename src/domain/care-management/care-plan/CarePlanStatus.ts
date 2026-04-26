export const CarePlanStatus = {
  Draft: 'draft',
  Finalized: 'finalized',
  Archived: 'archived',
} as const;

export type CarePlanStatus = (typeof CarePlanStatus)[keyof typeof CarePlanStatus];

export const CARE_PLAN_STATUS_LABELS: Record<CarePlanStatus, string> = {
  draft: '下書き',
  finalized: '確定',
  archived: 'アーカイブ',
};
