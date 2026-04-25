import { z } from 'zod';

export const IssueCategorySchema = z.enum([
  'health', 'adl', 'iadl', 'cognitive', 'social', 'family', 'other',
]);

export const IssuePrioritySchema = z.enum(['high', 'medium', 'low']);

export const AssessmentSummarizationResponseSchema = z.object({
  summary: z.string().min(1).max(2000),
  issues: z.array(z.object({
    category: IssueCategorySchema,
    description: z.string().min(1).max(500),
    priority: IssuePrioritySchema,
  })).min(1).max(15),
});

export type AssessmentSummarizationResponse =
  z.infer<typeof AssessmentSummarizationResponseSchema>;

export const assessmentSummarizationResponseJsonSchema =
  z.toJSONSchema(AssessmentSummarizationResponseSchema);
