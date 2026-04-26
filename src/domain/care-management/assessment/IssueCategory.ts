export type IssueCategory =
  | 'health'
  | 'adl'
  | 'iadl'
  | 'cognitive'
  | 'social'
  | 'family'
  | 'other';

export type IssuePriority = 'high' | 'medium' | 'low';

export const ISSUE_CATEGORY_VALUES = [
  'health',
  'adl',
  'iadl',
  'cognitive',
  'social',
  'family',
  'other',
] as const satisfies readonly IssueCategory[];

export const ISSUE_PRIORITY_VALUES = ['high', 'medium', 'low'] as const satisfies readonly IssuePriority[];

export const ISSUE_CATEGORY_LABELS: Record<IssueCategory, string> = {
  health: '健康・医療',
  adl: 'ADL',
  iadl: 'IADL',
  cognitive: '認知機能',
  social: '社会参加',
  family: '家族・介護環境',
  other: 'その他',
};

export const ISSUE_PRIORITY_LABELS: Record<IssuePriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

export function isIssueCategory(value: unknown): value is IssueCategory {
  return typeof value === 'string' && (ISSUE_CATEGORY_VALUES as readonly string[]).includes(value);
}

export function isIssuePriority(value: unknown): value is IssuePriority {
  return typeof value === 'string' && (ISSUE_PRIORITY_VALUES as readonly string[]).includes(value);
}
