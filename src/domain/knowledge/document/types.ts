export const KNOWLEDGE_SCOPE_VALUES = ['personal', 'shared'] as const;
export type KnowledgeScope = (typeof KNOWLEDGE_SCOPE_VALUES)[number];

export const PROCESSING_STATUS_VALUES = [
  'pending',
  'processing',
  'ready',
  'failed',
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUS_VALUES)[number];

export const SOURCE_FILE_TYPE_VALUES = ['pdf', 'docx', 'txt'] as const;
export type SourceFileType = (typeof SOURCE_FILE_TYPE_VALUES)[number];

export const PROCESSING_STATUS_LABELS: Record<ProcessingStatus, string> = {
  pending: '処理待ち',
  processing: '処理中',
  ready: '利用可能',
  failed: '失敗',
};

export const KNOWLEDGE_SCOPE_LABELS: Record<KnowledgeScope, string> = {
  personal: '個人',
  shared: '共有',
};
