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

export const carePlanDraftResponseJsonSchema =
  z.toJSONSchema(CarePlanDraftResponseSchema);
