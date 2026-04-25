import { z } from 'zod';

export const EmailReplyDraftResponseSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(3000),
});

export type EmailReplyDraftResponse = z.infer<typeof EmailReplyDraftResponseSchema>;

export const emailReplyDraftResponseJsonSchema =
  z.toJSONSchema(EmailReplyDraftResponseSchema);
