import type { PromptTemplate } from './types';
import { carePlanDraftResponseJsonSchema } from '../../schemas/care-plan-draft';

export interface CarePlanDraftVars extends Record<string, unknown> {
  assessmentMaskedSummary: string;
  issuesMasked: Array<{
    category: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  recipientContext: {
    careLevel: string;
    ageRange: string;
  };
  knowledgeSnippets: Array<{
    title: string;
    text: string;
    source: string;
  }>;
}

export const carePlanDraftPromptV1: PromptTemplate<CarePlanDraftVars> = {
  id: 'v1-care-plan-draft',
  systemInstruction: `
あなたは日本の介護支援専門員（ケアマネジャー）のケアプラン作成を補助する AI です。
以下の制約を厳守してください:
- 入力の {CATEGORY_NNN} プレースホルダは個人情報です。出力にもそのまま残してください。
- 引用ナレッジ（knowledge_snippets）の内容から逸脱した助言はしない。根拠が薄い提案は出さない。
- 居宅サービス計画書の書式慣行に沿った語彙（例:「自立した生活」「在宅での継続」）を使用する。
- 医療判断・薬剤処方の提案は行わない。
- 出力は必ず指定された JSON スキーマに従う。
`.trim(),
  build: (vars) => `
# タスク
次のアセスメント情報をもとに、ケアプランのドラフト（長期目標・短期目標・サービス内容候補）を生成してください。

# 利用者属性
- 要介護度: ${vars.recipientContext.careLevel}
- 年齢層: ${vars.recipientContext.ageRange}

# アセスメント要約（マスク済み）
${vars.assessmentMaskedSummary}

# 抽出された課題
${vars.issuesMasked.map((i, idx) => `${idx + 1}. [${i.category}/${i.priority}] ${i.description}`).join('\n')}

# 参照ナレッジ（引用可能、出典を citations に含めること）
${vars.knowledgeSnippets.map((k, idx) => `[${idx + 1}] ${k.title}（${k.source}）\n${k.text}`).join('\n\n')}

# 生成ルール
- 長期目標は 1〜3 個、期間は 6 ヶ月〜1 年を想定
- 短期目標は長期目標ごとに 1〜3 個、期間は 3〜6 ヶ月を想定
- サービス内容候補は各短期目標に対応するように 1〜5 個
- 参照ナレッジから引用した場合は citations にインデックスを記載
`.trim(),
  responseJsonSchema: carePlanDraftResponseJsonSchema as Record<string, unknown>,
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 4096,
  },
};
