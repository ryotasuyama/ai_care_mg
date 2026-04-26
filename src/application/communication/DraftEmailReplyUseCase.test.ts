import { describe, it, expect, vi } from 'vitest';
import { DraftEmailReplyUseCase } from './DraftEmailReplyUseCase';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IPiiMaskingService } from '@/domain/ai-support/masking/IPiiMaskingService';
import type { IEmailReplyDraftService } from '@/domain/ai-support/IEmailReplyDraftService';
import type { IAiGenerationLogRepository } from '@/domain/ai-support/IAiGenerationLogRepository';
import { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';
import { PiiPlaceholder } from '@/domain/ai-support/masking/PiiPlaceholder';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function makeAuth() {
  return { tenantId, userId, role: 'care_manager' as const };
}

function makeMaskingResult(overrides: { originalText?: string; maskedText?: string } = {}) {
  const placeholder = PiiPlaceholder.create('recipient_name', '田中太郎', 1);
  return MaskingResult.create({
    originalText: overrides.originalText ?? '田中太郎のご家族より連絡がありました。090-1234-5678 まで。',
    maskedText: overrides.maskedText ?? '{RECIPIENT_NAME_001}のご家族より連絡がありました。{PHONE_002} まで。',
    placeholders: [placeholder],
  });
}

function makeMockCareRecipientRepo(): ICareRecipientRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    save: vi.fn(),
    buildKnownPiiSetForTenant: vi.fn().mockResolvedValue({
      names: ['田中太郎'],
      aliases: ['田中'],
    }),
  };
}

function makeMockPiiMasking(maskingResult?: MaskingResult): IPiiMaskingService {
  return {
    mask: vi.fn().mockResolvedValue(maskingResult ?? makeMaskingResult()),
  };
}

function makeMockEmailReplyService(): IEmailReplyDraftService {
  return {
    draft: vi.fn().mockResolvedValue({
      subject: 'Re: {RECIPIENT_NAME_001}への訪問日程について',
      body: '{RECIPIENT_NAME_001}のご家族様\n\nご連絡いただきありがとうございます。',
      draftReply: 'Re: ...\n\n...',
      rawResponse: { ok: true },
      promptTemplateId: 'v1-email-reply-draft',
      tokenUsage: { requestTokens: 20, responseTokens: 30 },
      latencyMs: 200,
    }),
  };
}

function makeMockAiLogRepo(): IAiGenerationLogRepository {
  return { save: vi.fn().mockResolvedValue(undefined) };
}

describe('DraftEmailReplyUseCase', () => {
  it('happy path: マスキング → AI → アンマスク → ログ保存', async () => {
    const careRecipientRepo = makeMockCareRecipientRepo();
    const piiMasking = makeMockPiiMasking();
    const emailReplyService = makeMockEmailReplyService();
    const aiLogRepo = makeMockAiLogRepo();

    const uc = new DraftEmailReplyUseCase(careRecipientRepo, piiMasking, emailReplyService, aiLogRepo);

    const result = await uc.execute({
      auth: makeAuth(),
      incomingEmailBody: '田中太郎のご家族より連絡がありました。090-1234-5678 まで。',
      intent: '丁寧に日程調整を提案',
    });

    // テナント PII を収集していること
    expect(careRecipientRepo.buildKnownPiiSetForTenant).toHaveBeenCalledOnce();

    // マスキングサービスが呼ばれていること
    expect(piiMasking.mask).toHaveBeenCalledWith(
      '田中太郎のご家族より連絡がありました。090-1234-5678 まで。',
      expect.objectContaining({ recipientName: '田中太郎' }),
    );

    // AI サービスが masked text で呼ばれていること
    expect(emailReplyService.draft).toHaveBeenCalledWith(
      expect.objectContaining({
        maskedIncomingEmail: expect.stringContaining('{RECIPIENT_NAME_001}'),
        intent: '丁寧に日程調整を提案',
      }),
    );

    // ログが保存されていること
    expect(aiLogRepo.save).toHaveBeenCalledOnce();
    const logCall = (aiLogRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(logCall.kind).toBe('email_reply_draft');
    expect(logCall.originalText).not.toBeNull(); // email_reply_draft は original_text 必須
    expect(logCall.maskedText).toContain('{RECIPIENT_NAME_001}');

    // アンマスク済みの subject / body が返ること
    expect(result.subject).toBe('Re: 田中太郎への訪問日程について');
    expect(result.body).toContain('田中太郎のご家族様');

    // maskingStats が返ること
    expect(result.maskingStats.totalPlaceholders).toBeGreaterThan(0);
    expect(result.maskingStats.byCategory).toHaveProperty('recipient_name');
  });

  it('INVALID_INPUT: メール本文が空', async () => {
    const uc = new DraftEmailReplyUseCase(
      makeMockCareRecipientRepo(),
      makeMockPiiMasking(),
      makeMockEmailReplyService(),
      makeMockAiLogRepo(),
    );

    await expect(
      uc.execute({ auth: makeAuth(), incomingEmailBody: '' }),
    ).rejects.toThrow(UseCaseError);

    await expect(
      uc.execute({ auth: makeAuth(), incomingEmailBody: '' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('INVALID_INPUT: メール本文が5000文字超', async () => {
    const uc = new DraftEmailReplyUseCase(
      makeMockCareRecipientRepo(),
      makeMockPiiMasking(),
      makeMockEmailReplyService(),
      makeMockAiLogRepo(),
    );

    await expect(
      uc.execute({ auth: makeAuth(), incomingEmailBody: 'a'.repeat(5001) }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });

  it('intent なしでも AI サービスが呼ばれること', async () => {
    const emailReplyService = makeMockEmailReplyService();
    const uc = new DraftEmailReplyUseCase(
      makeMockCareRecipientRepo(),
      makeMockPiiMasking(),
      emailReplyService,
      makeMockAiLogRepo(),
    );

    await uc.execute({ auth: makeAuth(), incomingEmailBody: 'テストメール本文' });

    expect(emailReplyService.draft).toHaveBeenCalledWith(
      expect.objectContaining({ intent: undefined }),
    );
  });

  it('テナントに利用者がいなくてもエラーにならない（regex マスキングのみ）', async () => {
    const careRecipientRepo = makeMockCareRecipientRepo();
    (careRecipientRepo.buildKnownPiiSetForTenant as ReturnType<typeof vi.fn>).mockResolvedValue({
      names: [],
      aliases: [],
    });

    const maskingResult = MaskingResult.create({
      originalText: '090-1234-5678 まで連絡ください',
      maskedText: '090-1234-5678 まで連絡ください',
      placeholders: [],
    });
    const piiMasking = makeMockPiiMasking(maskingResult);

    const emailReplyService: IEmailReplyDraftService = {
      draft: vi.fn().mockResolvedValue({
        subject: 'Re: 件名',
        body: '本文です。',
        draftReply: 'Re: 件名\n\n本文です。',
        rawResponse: {},
        promptTemplateId: 'v1-email-reply-draft',
        tokenUsage: { requestTokens: 10, responseTokens: 10 },
        latencyMs: 100,
      }),
    };

    const uc = new DraftEmailReplyUseCase(
      careRecipientRepo,
      piiMasking,
      emailReplyService,
      makeMockAiLogRepo(),
    );

    const result = await uc.execute({ auth: makeAuth(), incomingEmailBody: '090-1234-5678 まで連絡ください' });
    expect(result.subject).toBe('Re: 件名');
  });
});
