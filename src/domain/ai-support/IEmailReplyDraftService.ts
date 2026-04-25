export interface IEmailReplyDraftService {
  draft(input: {
    maskedIncomingEmail: string;
    intent?: string;
  }): Promise<{
    subject: string;
    body: string;
    draftReply: string;
    rawResponse: unknown;
    promptTemplateId: string;
    tokenUsage: { requestTokens: number; responseTokens: number };
    latencyMs: number;
  }>;
}
