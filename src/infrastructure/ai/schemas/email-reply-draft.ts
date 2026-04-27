import { z } from 'zod';

export const EmailReplyDraftResponseSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(3000),
});

export type EmailReplyDraftResponse = z.infer<typeof EmailReplyDraftResponseSchema>;

// Gemini 互換スキーマ（minLength / maxLength 等を除去）
export const emailReplyDraftResponseJsonSchema = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
  },
  required: ['subject', 'body'],
} as const;
