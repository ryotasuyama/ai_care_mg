import { describe, it, expect, vi } from 'vitest';
import { GenerateAssessmentFromMaskedTextUseCase } from './GenerateAssessmentFromMaskedTextUseCase';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { IAssessmentDraftRepository, AssessmentDraft } from '@/domain/care-management/assessment/IAssessmentDraftRepository';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import type { IAiSummarizationService } from '@/domain/ai-support/IAiSummarizationService';
import type { IAiGenerationLogRepository } from '@/domain/ai-support/IAiGenerationLogRepository';
import { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';
import { PiiPlaceholder } from '@/domain/ai-support/masking/PiiPlaceholder';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const careRecipientId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const draftId = 'd1d2d3d4-1234-4abc-8def-123456789abc';

function makeDraft(): AssessmentDraft {
  const placeholder = PiiPlaceholder.create('recipient_name', '田中太郎', 1);
  const maskingResult = MaskingResult.create({
    originalText: '田中太郎さんは膝が痛い',
    maskedText: '{RECIPIENT_NAME_001} さんは膝が痛い',
    placeholders: [placeholder],
  });
  return {
    id: draftId,
    tenantId: new TenantId(tenantId),
    careRecipientId: new CareRecipientId(careRecipientId),
    maskingResult,
    createdBy: new UserId(userId),
    createdAt: new Date(),
  };
}

function makeAuth() {
  return { tenantId, userId, role: 'care_manager' as const };
}

function makeMockSummarization(overrides: Partial<{ issues: unknown[] }> = {}) {
  return {
    summarizeAsAssessment: vi.fn().mockResolvedValue({
      summary: 'AI 要約',
      issues: overrides.issues ?? [
        { category: 'adl', description: '{RECIPIENT_NAME_001} さんは歩行困難', priority: 'high' },
      ],
      rawResponse: { ok: true },
      promptTemplateId: 'v1-assessment-summarization',
      tokenUsage: { requestTokens: 10, responseTokens: 5 },
      latencyMs: 100,
    }),
  } satisfies IAiSummarizationService;
}

describe('GenerateAssessmentFromMaskedTextUseCase', () => {
  it('happy path: persists assessment, writes log, deletes draft', async () => {
    const draft = makeDraft();
    const draftRepo: IAssessmentDraftRepository = {
      saveTemporary: vi.fn(),
      findById: vi.fn().mockResolvedValue(draft),
      delete: vi.fn().mockResolvedValue(undefined),
    };
    const assessmentRepo: IAssessmentRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByRecipient: vi.fn(),
      findLatestFinalizedByRecipient: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    const aiLogRepo: IAiGenerationLogRepository = {
      save: vi.fn().mockResolvedValue(undefined),
    };

    const uc = new GenerateAssessmentFromMaskedTextUseCase(
      draftRepo,
      assessmentRepo,
      makeMockSummarization(),
      aiLogRepo,
    );

    const result = await uc.execute({
      auth: makeAuth(),
      draftId,
      approvedMaskedText: '{RECIPIENT_NAME_001} さんは膝が痛い',
      type: 'initial',
      conductedAt: '2026-04-25',
    });

    expect(result.assessmentId).toBeTruthy();
    expect(result.issueCount).toBe(1);
    expect(assessmentRepo.save).toHaveBeenCalled();
    expect(aiLogRepo.save).toHaveBeenCalled();
    const logCall = (aiLogRepo.save as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(logCall.originalText).toBeNull(); // 単一ソース原則
    expect(logCall.relatedEntityType).toBe('assessment');
    expect(draftRepo.delete).toHaveBeenCalledWith(draftId, expect.anything());
  });

  it('NOT_FOUND when draft is missing or expired', async () => {
    const draftRepo: IAssessmentDraftRepository = {
      saveTemporary: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
    };
    const assessmentRepo: IAssessmentRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByRecipient: vi.fn(),
      findLatestFinalizedByRecipient: vi.fn(),
      save: vi.fn(),
    };
    const aiLogRepo: IAiGenerationLogRepository = { save: vi.fn() };

    const uc = new GenerateAssessmentFromMaskedTextUseCase(
      draftRepo,
      assessmentRepo,
      makeMockSummarization(),
      aiLogRepo,
    );

    await expect(
      uc.execute({
        auth: makeAuth(),
        draftId,
        approvedMaskedText: '{RECIPIENT_NAME_001} さんは膝が痛い',
        type: 'initial',
        conductedAt: '2026-04-25',
      }),
    ).rejects.toThrow(UseCaseError);
  });

  it('blocks PII leak in approved masked text', async () => {
    const draft = makeDraft();
    const draftRepo: IAssessmentDraftRepository = {
      saveTemporary: vi.fn(),
      findById: vi.fn().mockResolvedValue(draft),
      delete: vi.fn(),
    };
    const assessmentRepo: IAssessmentRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByRecipient: vi.fn(),
      findLatestFinalizedByRecipient: vi.fn(),
      save: vi.fn(),
    };
    const aiLogRepo: IAiGenerationLogRepository = { save: vi.fn() };

    const uc = new GenerateAssessmentFromMaskedTextUseCase(
      draftRepo,
      assessmentRepo,
      makeMockSummarization(),
      aiLogRepo,
    );

    // 既知 PII を編集で書き戻したケース
    await expect(
      uc.execute({
        auth: makeAuth(),
        draftId,
        approvedMaskedText: '田中太郎 さんは膝が痛い',
        type: 'initial',
        conductedAt: '2026-04-25',
      }),
    ).rejects.toThrow(UseCaseError);
    expect(assessmentRepo.save).not.toHaveBeenCalled();
  });

  it('blocks new phone numbers added by hand in masked text', async () => {
    const draft = makeDraft();
    const draftRepo: IAssessmentDraftRepository = {
      saveTemporary: vi.fn(),
      findById: vi.fn().mockResolvedValue(draft),
      delete: vi.fn(),
    };
    const assessmentRepo: IAssessmentRepository = {
      findById: vi.fn(),
      findAll: vi.fn(),
      findByRecipient: vi.fn(),
      findLatestFinalizedByRecipient: vi.fn(),
      save: vi.fn(),
    };
    const aiLogRepo: IAiGenerationLogRepository = { save: vi.fn() };

    const uc = new GenerateAssessmentFromMaskedTextUseCase(
      draftRepo,
      assessmentRepo,
      makeMockSummarization(),
      aiLogRepo,
    );

    await expect(
      uc.execute({
        auth: makeAuth(),
        draftId,
        approvedMaskedText: '{RECIPIENT_NAME_001} さんに 090-9999-8888 で連絡',
        type: 'initial',
        conductedAt: '2026-04-25',
      }),
    ).rejects.toThrow(/マスク漏れ/);
  });
});
