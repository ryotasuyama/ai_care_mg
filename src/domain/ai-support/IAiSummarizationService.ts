import type { IssueCategory, IssuePriority } from './types';

export interface IAiSummarizationService {
  summarizeAsAssessment(input: {
    maskedText: string;
  }): Promise<{
    summary: string;
    issues: Array<{ category: IssueCategory; description: string; priority: IssuePriority }>;
    rawResponse: unknown;
    promptTemplateId: string;
    tokenUsage: { requestTokens: number; responseTokens: number };
    latencyMs: number;
  }>;
}
