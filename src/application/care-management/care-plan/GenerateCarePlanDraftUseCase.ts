import { z } from 'zod';
import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import type { IKnowledgeSearchService } from '@/domain/knowledge/search/IKnowledgeSearchService';
import type { IPiiMaskingService, KnownPiiSet } from '@/domain/ai-support/masking/IPiiMaskingService';
import type { ICarePlanGenerationService } from '@/domain/ai-support/ICarePlanGenerationService';
import type { IAiGenerationLogRepository } from '@/domain/ai-support/IAiGenerationLogRepository';
import { buildNameAliases } from '@/application/care-management/assessment/PrepareAssessmentDraftUseCase';

export const generateCarePlanDraftSchema = z.object({
  assessmentId: z.string().uuid(),
});

export type GenerateCarePlanDraftInput = {
  auth: AuthorizationContext;
} & z.infer<typeof generateCarePlanDraftSchema>;

export interface GenerateCarePlanDraftOutput {
  longTermGoals: Array<{ title: string; description: string; targetPeriodMonths: number }>;
  shortTermGoals: Array<{
    parentLongTermGoalIndex: number;
    title: string;
    description: string;
    targetPeriodMonths: number;
  }>;
  serviceItemCandidates: Array<{
    relatedShortTermGoalIndex: number;
    serviceType: string;
    serviceName: string;
    frequencyText: string;
    remarks?: string;
  }>;
  citations: Array<{ knowledgeIndex: number; usedFor: string }>;
  knowledgeSnippets: Array<{ title: string; source: string; similarity: number }>;
  /** 採用時のために CreateCarePlanFromDraftUseCase に渡すサーバ側保持セッション用ID。MVP では UI が再送 */
  assessmentSummaryUnmasked: string;
}

const AI_MODEL = 'gemini-1.5-flash';

export class GenerateCarePlanDraftUseCase
  implements IUseCase<GenerateCarePlanDraftInput, GenerateCarePlanDraftOutput>
{
  constructor(
    private readonly assessmentRepo: IAssessmentRepository,
    private readonly careRecipientRepo: ICareRecipientRepository,
    private readonly knowledgeSearch: IKnowledgeSearchService,
    private readonly piiMasking: IPiiMaskingService,
    private readonly carePlanGeneration: ICarePlanGenerationService,
    private readonly aiLogRepo: IAiGenerationLogRepository,
  ) {}

  async execute(input: GenerateCarePlanDraftInput): Promise<GenerateCarePlanDraftOutput> {
    const parsed = generateCarePlanDraftSchema.safeParse(input);
    if (!parsed.success) {
      throw new UseCaseError('INVALID_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    // 1. Finalized アセスメントを取得
    const assessment = await this.assessmentRepo.findById(
      new AssessmentId(input.assessmentId),
      tenantId,
    );
    if (!assessment) {
      throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');
    }
    if (assessment.status !== AssessmentStatus.Finalized) {
      throw new UseCaseError(
        'INVALID_INPUT',
        'ケアプラン生成は Finalized アセスメントのみ対象です',
      );
    }

    // 2. 利用者情報を取得
    const recipient = await this.careRecipientRepo.findById(assessment.careRecipientId, tenantId);
    if (!recipient) {
      throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');
    }

    // 3. RAG 検索: 課題テキスト (マスク済み) をクエリにする
    const queryText = [
      assessment.maskedSummary,
      ...assessment.issues.map((i) => i.description),
    ].join('\n');

    const searchResults = await this.knowledgeSearch.searchByText({
      queryText,
      tenantId,
      requesterId: userId,
      topK: 5,
      minSimilarity: 0.5,
    });

    // 4. RAG 結果を Gemini に渡す前に再マスキング
    //    (個人ナレッジに利用者氏名が紛れ込んでいる可能性に備えた多層防御)
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

    const reMaskedSnippets = await Promise.all(
      searchResults.map(async (k) => {
        const masked = await this.piiMasking.mask(k.chunkText, knownPiis);
        return {
          title: k.documentTitle,
          text: masked.maskedText,
          source: `${k.documentTitle}${k.chunkPageNumber ? ` p.${k.chunkPageNumber}` : ''}`,
          similarity: k.similarity,
        };
      }),
    );

    // 5. ケアプランドラフト生成 (マスク済み入力)
    const generation = await this.carePlanGeneration.generateDraft({
      assessmentMaskedSummary: assessment.maskedSummary,
      issuesMasked: assessment.issues.map((i) => ({
        category: i.category,
        description: i.description,
        priority: i.priority,
      })),
      recipientContext: {
        careLevel: recipient.currentCareLevel.value,
        ageRange: recipient.ageRange,
      },
      knowledgeSnippets: reMaskedSnippets,
    });

    // 6. AI 生成ログ記録 (related_entity = assessment)
    await this.aiLogRepo.save({
      tenantId,
      kind: 'care_plan_draft',
      originalText: null, // 集約 (assessments.source_transcript) が単一ソース
      maskedText: assessment.maskedSummary,
      placeholderMap: assessment.placeholderMap.toJSON().map((p) => ({
        token: p.token,
        category: p.category,
      })),
      aiResponse: generation.rawResponse,
      aiModel: AI_MODEL,
      promptTemplateId: generation.promptTemplateId,
      relatedEntityType: 'assessment',
      relatedEntityId: assessment.id.value,
      createdBy: userId,
      requestTokens: generation.tokenUsage.requestTokens,
      responseTokens: generation.tokenUsage.responseTokens,
      latencyMs: generation.latencyMs,
    });

    return {
      longTermGoals: generation.longTermGoals,
      shortTermGoals: generation.shortTermGoals,
      serviceItemCandidates: generation.serviceItemCandidates,
      citations: generation.citations,
      knowledgeSnippets: reMaskedSnippets.map((s) => ({
        title: s.title,
        source: s.source,
        similarity: s.similarity,
      })),
      assessmentSummaryUnmasked: assessment.getUnmaskedSummary(),
    };
  }
}
