import type { IEmailReplyDraftService } from '@/domain/ai-support/IEmailReplyDraftService';
import { GeminiClient } from './GeminiClient';
import { emailReplyDraftPromptV1 } from './prompts/v1/email-reply-draft';
import { EmailReplyDraftResponseSchema } from './schemas/email-reply-draft';

export class GeminiEmailReplyDraftService implements IEmailReplyDraftService {
  constructor(private readonly gemini: GeminiClient) {}

  async draft(input: { maskedIncomingEmail: string; intent?: string }) {
    const prompt = emailReplyDraftPromptV1;
    const vars = {
      maskedIncomingEmail: input.maskedIncomingEmail,
      intent: input.intent,
    };

    let lastError: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await this.gemini.generateJson({
        systemInstruction: prompt.systemInstruction,
        userPrompt: prompt.build(vars),
        responseSchema: prompt.responseJsonSchema,
        generationConfig: prompt.generationConfig,
      });

      const parsed = EmailReplyDraftResponseSchema.safeParse(raw.json);
      if (parsed.success) {
        const draftReply = `件名: ${parsed.data.subject}\n\n${parsed.data.body}`;
        return {
          subject: parsed.data.subject,
          body: parsed.data.body,
          draftReply,
          rawResponse: raw.rawResponse,
          promptTemplateId: prompt.id,
          tokenUsage: raw.tokenUsage,
          latencyMs: raw.latencyMs,
        };
      }
      lastError = parsed.error;
      console.warn(`[EmailReplyDraft] parse failed (attempt ${attempt})`, parsed.error);
    }
    throw new Error(`EmailReplyDraft: Gemini JSON parse failed after 2 attempts: ${lastError}`);
  }
}
