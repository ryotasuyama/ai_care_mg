'use server';

import { buildContainer } from '@/infrastructure/di/container';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Dev smoke actions must not be loaded in production');
}

export async function smokeAssessmentSummarization() {
  const { aiSummarizationService } = await buildContainer();
  return aiSummarizationService.summarizeAsAssessment({
    maskedText: '利用者は膝の痛みを訴えている。歩行が困難で、買い物に行けない状態。',
  });
}

export async function smokeCarePlanGeneration() {
  const { carePlanGenerationService } = await buildContainer();
  return carePlanGenerationService.generateDraft({
    assessmentMaskedSummary: '膝の痛みにより歩行困難。ADL 低下あり。',
    issuesMasked: [
      { category: 'adl', description: '歩行困難で外出できない', priority: 'high' },
    ],
    recipientContext: { careLevel: 'care_2', ageRange: '80代' },
    knowledgeSnippets: [],
  });
}

export async function smokeEmailReplyDraft() {
  const { emailReplyDraftService } = await buildContainer();
  return emailReplyDraftService.draft({
    maskedIncomingEmail: 'お世話になっております。サービス担当者会議の日程について確認させてください。',
    intent: '丁寧に日程調整を提案する',
  });
}

export async function smokeEmbedding() {
  const { embeddingService } = await buildContainer();
  const vector = await embeddingService.embed('テスト文書：介護支援専門員の業務について');
  return { dimensions: vector.dimensions, sample: vector.values.slice(0, 5) };
}
