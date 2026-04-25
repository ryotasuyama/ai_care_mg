import type { PromptTemplate } from './types';
import { assessmentSummarizationResponseJsonSchema } from '../../schemas/assessment-summarization';

export interface AssessmentSummarizationVars extends Record<string, unknown> {
  maskedTranscript: string;
}

export const assessmentSummarizationPromptV1: PromptTemplate<AssessmentSummarizationVars> = {
  id: 'v1-assessment-summarization',
  systemInstruction: `
あなたは日本の介護支援専門員（ケアマネジャー）の業務を補助する AI です。
以下の制約を厳守してください:
- 入力テキスト中の {CATEGORY_NNN} 形式のプレースホルダは個人情報をマスクしたものです。出力にもそのまま残してください（復元・推測しない）。
- 出力は必ず指定された JSON スキーマに従ってください。余計な前置きや説明文は出さない。
- 推測で情報を補完しない。原文から読み取れない内容は含めない。
- 医療行為の是非を断定しない。
`.trim(),
  build: (vars) => `
# タスク
次の音声記録から、介護支援専門員のアセスメント記録に必要な「課題・ニーズ」を抽出してください。

# 音声記録（マスク済み）
${vars.maskedTranscript}

# 分類カテゴリ
- health: 健康・医療（疾患・服薬・通院等）
- adl: ADL（食事・排泄・入浴・移動・更衣）
- iadl: IADL（買い物・調理・金銭管理・服薬管理）
- cognitive: 認知機能（見当識・記憶・判断）
- social: 社会参加・対人関係
- family: 家族・介護環境
- other: 上記に当てはまらないもの

# 優先度の基準
- high: 生命・安全に直結、緊急対応が必要
- medium: 生活の質に影響、計画的対応が必要
- low: 情報として記録しておくべき事項

# 出力形式
後述の JSON スキーマに従うこと。課題は最低 1 件、最大 15 件まで。
`.trim(),
  responseJsonSchema: assessmentSummarizationResponseJsonSchema as Record<string, unknown>,
  generationConfig: {
    temperature: 0.2,
    maxOutputTokens: 2048,
  },
};
