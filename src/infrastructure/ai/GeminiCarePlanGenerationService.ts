import type { ICarePlanGenerationService } from '@/domain/ai-support/ICarePlanGenerationService';
import { GeminiClient } from './GeminiClient';
import { carePlanDraftPromptV1 } from './prompts/v1/care-plan-draft';
import { CarePlanDraftResponseSchema } from './schemas/care-plan-draft';

export class GeminiCarePlanGenerationService implements ICarePlanGenerationService {
  constructor(private readonly gemini: GeminiClient) {}

  async generateDraft(input: Parameters<ICarePlanGenerationService['generateDraft']>[0]) {
    const prompt = carePlanDraftPromptV1;
    const vars = {
      assessmentMaskedSummary: input.assessmentMaskedSummary,
      issuesMasked: input.issuesMasked,
      recipientContext: input.recipientContext,
      knowledgeSnippets: input.knowledgeSnippets.map((k) => ({
        title: k.title,
        text: k.text,
        source: k.source,
      })),
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await this.gemini.generateJson({
        systemInstruction: prompt.systemInstruction,
        userPrompt: prompt.build(vars),
        responseSchema: prompt.responseJsonSchema,
        generationConfig: prompt.generationConfig,
      });

      const parsed = CarePlanDraftResponseSchema.safeParse(raw.json);
      if (parsed.success) {
        return {
          longTermGoals: parsed.data.longTermGoals,
          shortTermGoals: parsed.data.shortTermGoals,
          serviceItemCandidates: parsed.data.serviceItemCandidates,
          citations: parsed.data.citations,
          rawResponse: raw.rawResponse,
          promptTemplateId: prompt.id,
          tokenUsage: raw.tokenUsage,
          latencyMs: raw.latencyMs,
        };
      }
      lastError = parsed.error;
      console.warn(`[CarePlanGeneration] parse failed (attempt ${attempt})`, parsed.error);
    }
    throw new Error(`CarePlanDraft: Gemini JSON parse failed after 2 attempts: ${lastError}`);
  }
}
