import type { PromptTemplate } from './types';
import { emailReplyDraftResponseJsonSchema } from '../../schemas/email-reply-draft';

export interface EmailReplyDraftVars extends Record<string, unknown> {
  maskedIncomingEmail: string;
  intent?: string;
}

export const emailReplyDraftPromptV1: PromptTemplate<EmailReplyDraftVars> = {
  id: 'v1-email-reply-draft',
  systemInstruction: `
あなたは日本の介護支援専門員の事務補助 AI です。
以下の制約を厳守してください:
- 入力の {CATEGORY_NNN} プレースホルダは個人情報です。返信文にもそのまま残してください。
- ビジネスメールとして丁寧な日本語で書く。過度に硬すぎない、自然な業務メール口調。
- 推測で事実を追加しない。原文に書かれていない予定・金額・条件を作らない。
- 署名欄には {CAREGIVER_NAME} を入れる（後でケアマネ本人がコピー時に置換する前提）。
- 出力は必ず指定された JSON スキーマに従う。
`.trim(),
  build: (vars) => `
# タスク
次の受信メールに対する返信ドラフトを生成してください。

${vars.intent ? `# 返信の方向性\n${vars.intent}\n` : ''}
# 受信メール本文（マスク済み）
${vars.maskedIncomingEmail}

# 出力形式
subject と body を返してください。本文は段落を改行で区切った自然な日本語にする。
`.trim(),
  responseJsonSchema: emailReplyDraftResponseJsonSchema as Record<string, unknown>,
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 1024,
  },
};
