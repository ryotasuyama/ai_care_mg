import type { TenantId } from '@/domain/shared/TenantId';
import type { UserId } from '@/domain/shared/UserId';
import type { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';

export interface AssessmentDraftPayload {
  tenantId: TenantId;
  careRecipientId: CareRecipientId;
  maskingResult: MaskingResult;
  createdBy: UserId;
}

export interface AssessmentDraft {
  id: string;
  tenantId: TenantId;
  careRecipientId: CareRecipientId;
  maskingResult: MaskingResult;
  createdBy: UserId;
  createdAt: Date;
}

export interface IAssessmentDraftRepository {
  /**
   * 一時保存。draftId を返す。
   */
  saveTemporary(payload: AssessmentDraftPayload): Promise<string>;

  /**
   * draftId で取得。30 分超過したものは null を返す (TTL は読み取り時に検証)。
   * テナント越境ガードのため tenantId 必須。
   */
  findById(draftId: string, tenantId: TenantId): Promise<AssessmentDraft | null>;

  /**
   * 削除 (使用済みドラフトの片付け)。
   */
  delete(draftId: string, tenantId: TenantId): Promise<void>;
}

/** 30 分の TTL */
export const ASSESSMENT_DRAFT_TTL_MS = 30 * 60 * 1000;
