import type { IAiSummarizationService } from '@/domain/ai-support/IAiSummarizationService';
import { GeminiClient } from './GeminiClient';
import { assessmentSummarizationPromptV1 } from './prompts/v1/assessment-summarization';
import { AssessmentSummarizationResponseSchema } from './schemas/assessment-summarization';

export class GeminiAiSummarizationService implements IAiSummarizationService {
  constructor(private readonly gemini: GeminiClient) {}

  async summarizeAsAssessment(input: { maskedText: string }) {
    const prompt = assessmentSummarizationPromptV1;
    const vars = { maskedTranscript: input.maskedText };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await this.gemini.generateJson({
        systemInstruction: prompt.systemInstruction,
        userPrompt: prompt.build(vars),
        responseSchema: prompt.responseJsonSchema,
        generationConfig: prompt.generationConfig,
      });

      const parsed = AssessmentSummarizationResponseSchema.safeParse(raw.json);
      if (parsed.success) {
        return {
          summary: parsed.data.summary,
          issues: parsed.data.issues,
          rawResponse: raw.rawResponse,
          promptTemplateId: prompt.id,
          tokenUsage: raw.tokenUsage,
          latencyMs: raw.latencyMs,
        };
      }
      lastError = parsed.error;
      console.warn(`[AiSummarization] parse failed (attempt ${attempt})`, parsed.error);
    }
    throw new Error(`Gemini JSON response failed to parse after 2 attempts: ${lastError}`);
  }
}
