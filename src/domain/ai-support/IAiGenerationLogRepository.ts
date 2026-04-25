import type { TenantId } from '@/domain/shared/TenantId';
import type { UserId } from '@/domain/shared/UserId';
import type { MaskingStatistics } from './masking/MaskingResult';

export type AiGenerationKind =
  | 'assessment_summarization'
  | 'care_plan_draft'
  | 'email_reply_draft';

export interface AiGenerationLogRecord {
  tenantId: TenantId;
  kind: AiGenerationKind;

  /** email_reply_draft の場合は必須、集約が単一ソースを持つ場合は null */
  originalText: string | null;
  maskedText: string;
  placeholderMap: Array<{
    token: string;
    category: string;
    /** 集約側が保持する場合は省略 */
    originalValue?: string;
  }>;
  maskingStats?: MaskingStatistics;

  aiResponse: unknown;
  aiModel: string;
  promptTemplateId: string;

  relatedEntityType?: 'assessment' | 'care_plan';
  relatedEntityId?: string;

  createdBy: UserId;

  requestTokens?: number;
  responseTokens?: number;
  latencyMs?: number;
}

export interface IAiGenerationLogRepository {
  save(record: AiGenerationLogRecord): Promise<void>;
}
