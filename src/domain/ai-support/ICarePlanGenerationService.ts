import type { IssueCategory, IssuePriority } from './types';

export interface CarePlanLongTermGoal {
  title: string;
  description: string;
  targetPeriodMonths: number;
}

export interface CarePlanShortTermGoal {
  parentLongTermGoalIndex: number;
  title: string;
  description: string;
  targetPeriodMonths: number;
}

export interface CarePlanServiceItemCandidate {
  relatedShortTermGoalIndex: number;
  serviceType: string;
  serviceName: string;
  frequencyText: string;
  remarks?: string;
}

export interface CarePlanCitation {
  knowledgeIndex: number;
  usedFor: string;
}

export interface ICarePlanGenerationService {
  generateDraft(input: {
    assessmentMaskedSummary: string;
    issuesMasked: Array<{ category: IssueCategory; description: string; priority: IssuePriority }>;
    recipientContext: { careLevel: string; ageRange: string };
    knowledgeSnippets: Array<{ title: string; text: string; source: string; similarity: number }>;
  }): Promise<{
    longTermGoals: CarePlanLongTermGoal[];
    shortTermGoals: CarePlanShortTermGoal[];
    serviceItemCandidates: CarePlanServiceItemCandidate[];
    citations: CarePlanCitation[];
    rawResponse: unknown;
    promptTemplateId: string;
    tokenUsage: { requestTokens: number; responseTokens: number };
    latencyMs: number;
  }>;
}
