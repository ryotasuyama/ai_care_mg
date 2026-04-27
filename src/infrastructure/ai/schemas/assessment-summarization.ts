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

// Gemini responseSchema は JSON Schema のサブセットのみ対応。
// z.toJSONSchema が生成する $schema / minLength / maxLength / minItems / maxItems /
// additionalProperties は Gemini が拒否するため、手動で Gemini 互換スキーマを定義する。
export const assessmentSummarizationResponseJsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['health', 'adl', 'iadl', 'cognitive', 'social', 'family', 'other'],
          },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['category', 'description', 'priority'],
      },
    },
  },
  required: ['summary', 'issues'],
} as const;
