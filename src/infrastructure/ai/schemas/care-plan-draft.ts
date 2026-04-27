import { z } from 'zod';

export const CarePlanDraftResponseSchema = z.object({
  longTermGoals: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    targetPeriodMonths: z.number().int().min(1).max(24),
  })).min(1).max(3),
  shortTermGoals: z.array(z.object({
    parentLongTermGoalIndex: z.number().int().min(0),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(1000),
    targetPeriodMonths: z.number().int().min(1).max(12),
  })).min(1).max(9),
  serviceItemCandidates: z.array(z.object({
    relatedShortTermGoalIndex: z.number().int().min(0),
    serviceType: z.string().min(1).max(50),
    serviceName: z.string().min(1).max(200),
    frequencyText: z.string().max(200),
    remarks: z.string().max(500).optional(),
  })).max(30),
  citations: z.array(z.object({
    knowledgeIndex: z.number().int().min(0),
    usedFor: z.string().min(1).max(200),
  })).max(20),
});

export type CarePlanDraftResponse = z.infer<typeof CarePlanDraftResponseSchema>;

// Gemini 互換スキーマ（minLength / maxLength / minItems / maxItems 等を除去）
export const carePlanDraftResponseJsonSchema = {
  type: 'object',
  properties: {
    longTermGoals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          targetPeriodMonths: { type: 'integer' },
        },
        required: ['title', 'description', 'targetPeriodMonths'],
      },
    },
    shortTermGoals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          parentLongTermGoalIndex: { type: 'integer' },
          title: { type: 'string' },
          description: { type: 'string' },
          targetPeriodMonths: { type: 'integer' },
        },
        required: ['parentLongTermGoalIndex', 'title', 'description', 'targetPeriodMonths'],
      },
    },
    serviceItemCandidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          relatedShortTermGoalIndex: { type: 'integer' },
          serviceType: { type: 'string' },
          serviceName: { type: 'string' },
          frequencyText: { type: 'string' },
          remarks: { type: 'string' },
        },
        required: ['relatedShortTermGoalIndex', 'serviceType', 'serviceName', 'frequencyText'],
      },
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          knowledgeIndex: { type: 'integer' },
          usedFor: { type: 'string' },
        },
        required: ['knowledgeIndex', 'usedFor'],
      },
    },
  },
  required: ['longTermGoals', 'shortTermGoals', 'serviceItemCandidates', 'citations'],
} as const;
