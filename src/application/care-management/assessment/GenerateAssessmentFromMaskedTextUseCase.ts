import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import type { IAssessmentDraftRepository } from '@/domain/care-management/assessment/IAssessmentDraftRepository';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import type { IAiSummarizationService } from '@/domain/ai-support/IAiSummarizationService';
import type { IAiGenerationLogRepository } from '@/domain/ai-support/IAiGenerationLogRepository';
import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import { PlaceholderMapSnapshot } from '@/domain/care-management/assessment/PlaceholderMapSnapshot';
import { ASSESSMENT_TYPE_VALUES, type AssessmentType } from '@/domain/care-management/assessment/AssessmentType';
import { AssessmentValidationError } from '@/domain/care-management/assessment/AssessmentValidationError';
import { verifyNoPiiLeak } from './verifyNoPiiLeak';

export const generateAssessmentFromMaskedTextSchema = z.object({
  draftId: z.string().uuid('draftId が不正です'),
  approvedMaskedText: z.string().min(1, 'マスク後テキストは必須です'),
  type: z.enum(ASSESSMENT_TYPE_VALUES),
  conductedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '実施日の形式が正しくありません'),
});

export type GenerateAssessmentFromMaskedTextInput = {
  auth: AuthorizationContext;
} & z.infer<typeof generateAssessmentFromMaskedTextSchema>;

export interface GenerateAssessmentFromMaskedTextOutput {
  assessmentId: string;
  issueCount: number;
}

export class GenerateAssessmentFromMaskedTextUseCase
  implements
    IUseCase<GenerateAssessmentFromMaskedTextInput, GenerateAssessmentFromMaskedTextOutput>
{
  constructor(
    private readonly draftRepo: IAssessmentDraftRepository,
    private readonly assessmentRepo: IAssessmentRepository,
    private readonly aiSummarization: IAiSummarizationService,
    private readonly aiLogRepo: IAiGenerationLogRepository,
    private readonly aiModel: string = 'gemini-1.5-flash',
  ) {}

  async execute(
    input: GenerateAssessmentFromMaskedTextInput,
  ): Promise<GenerateAssessmentFromMaskedTextOutput> {
    const parsed = generateAssessmentFromMaskedTextSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    // 1. 一時ドラフト取得 (TTL 失効込み)
    const draft = await this.draftRepo.findById(input.draftId, tenantId);
    if (!draft) {
      throw new UseCaseError(
        'NOT_FOUND',
        'マスキング結果が見つからないか有効期限が切れています。再度準備してください。',
      );
    }

    // 2. ユーザーが編集した最終マスク後テキストを多層防御チェック
    verifyNoPiiLeak(input.approvedMaskedText, draft.maskingResult);

    // 3. AI 要約 (マスク済み入力)
    const summarization = await this.aiSummarization.summarizeAsAssessment({
      maskedText: input.approvedMaskedText,
    });

    if (summarization.issues.length === 0) {
      throw new UseCaseError(
        'INCONSISTENT_DATA',
        'AI が課題を抽出できませんでした。原文を見直してください。',
      );
    }

    // 4. アセスメント集約を生成
    const placeholderMap = PlaceholderMapSnapshot.create(
      draft.maskingResult.placeholders.map((p) => ({
        token: p.token,
        originalValue: p.originalValue,
        category: p.category,
      })),
    );

    const issues = summarization.issues.map((issue, idx) =>
      AssessmentIssue.create({
        category: issue.category,
        description: issue.description,
        priority: issue.priority,
        sequenceNo: idx + 1,
      }),
    );

    let assessment: Assessment;
    try {
      assessment = Assessment.create({
        tenantId,
        careRecipientId: draft.careRecipientId,
        type: input.type as AssessmentType,
        issues,
        sourceTranscript: draft.maskingResult.originalText,
        maskedSummary: input.approvedMaskedText,
        placeholderMap,
        conductedAt: new Date(input.conductedAt),
        createdBy: userId,
      });
    } catch (error) {
      if (error instanceof AssessmentValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      throw error;
    }

    // 5. 永続化 → 6. 監査ログ → 7. ドラフト削除
    await this.assessmentRepo.save(assessment);

    await this.aiLogRepo.save({
      tenantId,
      kind: 'assessment_summarization',
      // 集約 (assessments.source_transcript) が単一ソース。ログ側は NULL
      originalText: null,
      maskedText: input.approvedMaskedText,
      placeholderMap: draft.maskingResult.placeholders.map((p) => ({
        token: p.token,
        category: p.category,
      })),
      maskingStats: draft.maskingResult.statistics,
      aiResponse: summarization.rawResponse,
      aiModel: this.aiModel,
      promptTemplateId: summarization.promptTemplateId,
      relatedEntityType: 'assessment',
      relatedEntityId: assessment.id.value,
      createdBy: userId,
      requestTokens: summarization.tokenUsage.requestTokens,
      responseTokens: summarization.tokenUsage.responseTokens,
      latencyMs: summarization.latencyMs,
    });

    await this.draftRepo.delete(input.draftId, tenantId);

    return {
      assessmentId: assessment.id.value,
      issueCount: assessment.issues.length,
    };
  }
}
