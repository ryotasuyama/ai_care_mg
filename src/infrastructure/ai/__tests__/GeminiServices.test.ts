import { describe, it, expect, vi } from 'vitest';
import type { GeminiGenerateJsonResult } from '../GeminiClient';
import { GeminiAiSummarizationService } from '../GeminiAiSummarizationService';
import { GeminiCarePlanGenerationService } from '../GeminiCarePlanGenerationService';
import { GeminiEmailReplyDraftService } from '../GeminiEmailReplyDraftService';

function makeMockGemini(jsonResponse: unknown): {
  generateJson: ReturnType<typeof vi.fn>;
  embed: ReturnType<typeof vi.fn>;
} {
  const result: GeminiGenerateJsonResult = {
    json: jsonResponse,
    rawResponse: { mock: true },
    tokenUsage: { requestTokens: 100, responseTokens: 50 },
    latencyMs: 123,
  };
  return {
    generateJson: vi.fn().mockResolvedValue(result),
    embed: vi.fn(),
  };
}

describe('GeminiAiSummarizationService', () => {
  it('Zod パース成功時に正しい構造を返す', async () => {
    const validResponse = {
      summary: '利用者は膝の痛みを訴えており、ADL に支障がある。',
      issues: [
        { category: 'adl', description: '膝の痛みで歩行困難', priority: 'high' },
      ],
    };
    const mockGemini = makeMockGemini(validResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiAiSummarizationService(mockGemini as any);

    const result = await service.summarizeAsAssessment({ maskedText: 'テスト入力' });

    expect(result.summary).toBe(validResponse.summary);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.category).toBe('adl');
    expect(result.promptTemplateId).toBe('v1-assessment-summarization');
    expect(result.tokenUsage.requestTokens).toBe(100);
    expect(result.latencyMs).toBe(123);
  });

  it('Zod パース失敗が 2 回続くと例外を投げる', async () => {
    const invalidResponse = { bad: 'structure' };
    const mockGemini = makeMockGemini(invalidResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiAiSummarizationService(mockGemini as any);

    await expect(
      service.summarizeAsAssessment({ maskedText: 'テスト' }),
    ).rejects.toThrow('failed to parse after 2 attempts');

    expect(mockGemini.generateJson).toHaveBeenCalledTimes(2);
  });
});

describe('GeminiCarePlanGenerationService', () => {
  it('Zod パース成功時に正しい構造を返す', async () => {
    const validResponse = {
      longTermGoals: [
        { title: '自立した生活の継続', description: '在宅での安全な生活', targetPeriodMonths: 12 },
      ],
      shortTermGoals: [
        {
          parentLongTermGoalIndex: 0,
          title: '痛みの軽減',
          description: '膝の痛みを緩和する',
          targetPeriodMonths: 3,
        },
      ],
      serviceItemCandidates: [
        {
          relatedShortTermGoalIndex: 0,
          serviceType: '訪問リハビリ',
          serviceName: 'リハビリテーション',
          frequencyText: '週2回',
        },
      ],
      citations: [],
    };
    const mockGemini = makeMockGemini(validResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiCarePlanGenerationService(mockGemini as any);

    const result = await service.generateDraft({
      assessmentMaskedSummary: 'テスト要約',
      issuesMasked: [{ category: 'adl', description: '歩行困難', priority: 'high' }],
      recipientContext: { careLevel: 'care_2', ageRange: '80代' },
      knowledgeSnippets: [],
    });

    expect(result.longTermGoals).toHaveLength(1);
    expect(result.promptTemplateId).toBe('v1-care-plan-draft');
  });

  it('パース失敗が 2 回続くと例外を投げる', async () => {
    const mockGemini = makeMockGemini({ invalid: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiCarePlanGenerationService(mockGemini as any);

    await expect(
      service.generateDraft({
        assessmentMaskedSummary: '',
        issuesMasked: [],
        recipientContext: { careLevel: 'care_1', ageRange: '70代' },
        knowledgeSnippets: [],
      }),
    ).rejects.toThrow();

    expect(mockGemini.generateJson).toHaveBeenCalledTimes(2);
  });
});

describe('GeminiEmailReplyDraftService', () => {
  it('Zod パース成功時に subject / body / draftReply を返す', async () => {
    const validResponse = {
      subject: 'Re: ご連絡の件',
      body: 'ご連絡いただきありがとうございます。\n\n件の件について確認いたします。',
    };
    const mockGemini = makeMockGemini(validResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiEmailReplyDraftService(mockGemini as any);

    const result = await service.draft({ maskedIncomingEmail: 'テストメール本文' });

    expect(result.subject).toBe('Re: ご連絡の件');
    expect(result.body).toContain('ありがとうございます');
    expect(result.draftReply).toContain('件名: Re: ご連絡の件');
    expect(result.promptTemplateId).toBe('v1-email-reply-draft');
  });

  it('intent を渡した場合もプロンプトが構築される', async () => {
    const validResponse = { subject: '件名', body: '本文' };
    const mockGemini = makeMockGemini(validResponse);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiEmailReplyDraftService(mockGemini as any);

    await service.draft({ maskedIncomingEmail: 'メール', intent: '丁寧に断る' });

    const call = mockGemini.generateJson.mock.calls[0]?.[0];
    expect(call?.userPrompt).toContain('丁寧に断る');
  });
});
