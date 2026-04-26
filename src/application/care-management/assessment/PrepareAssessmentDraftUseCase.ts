import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type {
  IPiiMaskingService,
  KnownPiiSet,
} from '@/domain/ai-support/masking/IPiiMaskingService';
import type { IAssessmentDraftRepository } from '@/domain/care-management/assessment/IAssessmentDraftRepository';
import type { PiiCategory } from '@/domain/ai-support/masking/PiiPlaceholder';

export const prepareAssessmentDraftSchema = z.object({
  careRecipientId: z.string().uuid('利用者IDが不正です'),
  voiceTranscript: z.string().min(1, '音声原文は必須です'),
});

export type PrepareAssessmentDraftInput = {
  auth: AuthorizationContext;
} & z.infer<typeof prepareAssessmentDraftSchema>;

export interface PrepareAssessmentDraftOutput {
  draftId: string;
  originalText: string;
  maskedText: string;
  placeholderSummary: Array<{
    category: PiiCategory;
    token: string;
    originalValue: string;
  }>;
}

export class PrepareAssessmentDraftUseCase
  implements IUseCase<PrepareAssessmentDraftInput, PrepareAssessmentDraftOutput>
{
  constructor(
    private readonly careRecipientRepo: ICareRecipientRepository,
    private readonly piiMasking: IPiiMaskingService,
    private readonly draftRepo: IAssessmentDraftRepository,
  ) {}

  async execute(input: PrepareAssessmentDraftInput): Promise<PrepareAssessmentDraftOutput> {
    const parsed = prepareAssessmentDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const recipientId = new CareRecipientId(input.careRecipientId);

    const recipient = await this.careRecipientRepo.findById(recipientId, tenantId);
    if (!recipient) {
      throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');
    }

    const knownPiis: KnownPiiSet = {
      recipientName: recipient.fullName,
      recipientNameAliases: buildNameAliases(recipient.fullName),
      familyMembers: recipient.familyMembers.map((f) => ({ name: f.name, relation: f.relation })),
      phones: [
        recipient.phoneNumber,
        ...recipient.familyMembers.map((f) => f.phoneNumber).filter(Boolean),
      ].filter((p): p is string => Boolean(p)),
      addresses: [recipient.address].filter(Boolean),
    };

    const maskingResult = await this.piiMasking.mask(input.voiceTranscript, knownPiis);

    const draftId = await this.draftRepo.saveTemporary({
      tenantId,
      careRecipientId: recipientId,
      maskingResult,
      createdBy: new UserId(input.auth.userId),
    });

    return {
      draftId,
      originalText: maskingResult.originalText,
      maskedText: maskingResult.maskedText,
      placeholderSummary: maskingResult.placeholders.map((p) => ({
        category: p.category,
        token: p.token,
        originalValue: p.originalValue,
      })),
    };
  }
}

/**
 * 「田中太郎」→ ["田中太郎さん", "田中さん", "太郎さん"]
 * 苗字・名前の分割は空白区切りを優先、なければフルネームをそのまま敬称付きで出す。
 */
export function buildNameAliases(fullName: string): string[] {
  const trimmed = fullName.trim();
  if (!trimmed) return [];

  const aliases = new Set<string>();
  aliases.add(`${trimmed}さん`);
  aliases.add(`${trimmed}様`);

  const parts = trimmed.split(/[\s　]+/).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[0]!;
    const first = parts.slice(1).join('');
    aliases.add(`${last}さん`);
    aliases.add(`${first}さん`);
    aliases.add(`${last}様`);
    aliases.add(`${first}様`);
  } else if (trimmed.length >= 2) {
    // 「田中太郎」のように分かち書きがない場合は前2文字 / 後2文字で苗字・名前候補を生成
    const last = trimmed.slice(0, 2);
    const first = trimmed.slice(2);
    if (first) {
      aliases.add(`${last}さん`);
      aliases.add(`${first}さん`);
    }
  }
  return [...aliases];
}
