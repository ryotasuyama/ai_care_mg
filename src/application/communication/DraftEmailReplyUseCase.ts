import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type {
  IPiiMaskingService,
  KnownPiiSet as MaskingKnownPiiSet,
} from '@/domain/ai-support/masking/IPiiMaskingService';
import type { IEmailReplyDraftService } from '@/domain/ai-support/IEmailReplyDraftService';
import type { IAiGenerationLogRepository } from '@/domain/ai-support/IAiGenerationLogRepository';
import type { MaskingStatistics } from '@/domain/ai-support/masking/MaskingResult';

const draftEmailReplySchema = z.object({
  incomingEmailBody: z
    .string()
    .min(1, 'メール本文は必須です')
    .max(5000, 'メール本文は5000文字以内にしてください'),
  intent: z.string().max(200, '返信方向性は200文字以内にしてください').optional(),
});

export type DraftEmailReplyInput = {
  auth: AuthorizationContext;
} & z.infer<typeof draftEmailReplySchema>;

export interface DraftEmailReplyOutput {
  subject: string;
  body: string;
  maskingStats: MaskingStatistics;
}

export class DraftEmailReplyUseCase
  implements IUseCase<DraftEmailReplyInput, DraftEmailReplyOutput>
{
  constructor(
    private readonly careRecipientRepo: ICareRecipientRepository,
    private readonly piiMasking: IPiiMaskingService,
    private readonly emailReplyDraftService: IEmailReplyDraftService,
    private readonly aiLogRepo: IAiGenerationLogRepository,
    private readonly aiModel: string,
  ) {}

  async execute(input: DraftEmailReplyInput): Promise<DraftEmailReplyOutput> {
    const parsed = draftEmailReplySchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    // 1. テナント内の全利用者 PII を収集
    //    email はどの利用者に言及しているか不明なため全員分をまとめて渡す
    const tenantPiiSet = await this.careRecipientRepo.buildKnownPiiSetForTenant(tenantId);

    // 2. ICareRecipientRepository.KnownPiiSet → IPiiMaskingService.KnownPiiSet に変換
    const allNames = [...tenantPiiSet.names, ...tenantPiiSet.aliases].filter(
      (n) => n.trim().length > 0,
    );
    const [primaryName, ...otherNames] = allNames;
    const maskingKnownPiis: MaskingKnownPiiSet = {
      // 利用者未登録時は空白（regex マスキングのみ動作）
      recipientName: primaryName ?? ' ',
      recipientNameAliases: otherNames,
    };

    // 3. メール本文をマスキング
    const maskingResult = await this.piiMasking.mask(input.incomingEmailBody, maskingKnownPiis);

    // 4. Gemini にドラフト生成を依頼
    const draftResult = await this.emailReplyDraftService.draft({
      maskedIncomingEmail: maskingResult.maskedText,
      intent: input.intent,
    });

    // 5. 監査ログ記録
    await this.aiLogRepo.save({
      tenantId,
      kind: 'email_reply_draft',
      originalText: maskingResult.originalText,
      maskedText: maskingResult.maskedText,
      placeholderMap: maskingResult.placeholders.map((p) => ({
        token: p.token,
        category: p.category,
        originalValue: p.originalValue,
      })),
      maskingStats: maskingResult.statistics,
      aiResponse: draftResult.rawResponse,
      aiModel: this.aiModel,
      promptTemplateId: draftResult.promptTemplateId,
      createdBy: userId,
      requestTokens: draftResult.tokenUsage.requestTokens,
      responseTokens: draftResult.tokenUsage.responseTokens,
      latencyMs: draftResult.latencyMs,
    });

    // 6. Gemini 出力のプレースホルダをアンマスクして返す
    const subject = maskingResult.unmask(draftResult.subject);
    const body = maskingResult.unmask(draftResult.body);

    return { subject, body, maskingStats: maskingResult.statistics };
  }
}
