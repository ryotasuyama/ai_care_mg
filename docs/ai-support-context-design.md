# AI 支援コンテキスト 詳細設計ドキュメント

> 本ドキュメントは `care-manager-ai-design.md` の「10.2 AI 支援コンテキストの設計」を詳細化したもの。
> PII マスキング以外の AI 支援責務（プロンプト管理・Gemini クライアント・JSON レスポンス検証・AI 生成ログ・モデル選定）を 1 本に集約する。
> PII マスキングは `pii-masking-design.md` 側で扱う（同コンテキストの双子ドキュメント）。

**ドキュメントバージョン**: 0.1（新規作成）
**最終更新**: 2026-04-24
**親ドキュメント**: `care-manager-ai-design.md`
**関連ドキュメント**: `pii-masking-design.md`, `assessment-aggregate-design.md`, `knowledge-context-design.md`

---

## 1. 背景と方針

### 1.1 親ドキュメントでの位置づけ

AI 支援コンテキストは `care-manager-ai-design.md §3.1` で定義された 5 つの境界づけられたコンテキストのひとつ。集約を持たず、サービス層 + `ai_generation_logs` テーブルで構成される。

本コンテキストの責務は以下の 4 点:

| 責務 | 扱うドキュメント |
|------|----------------|
| PII マスキング | `pii-masking-design.md` |
| プロンプトテンプレート管理 | **本ドキュメント** |
| Gemini API 呼び出し（要約・ドラフト生成・埋め込み） | **本ドキュメント** |
| AI 生成ログの永続化 | **本ドキュメント** |

### 1.2 確定した設計判断

| 項目 | 採用方針 | 決定理由 |
|------|---------|---------|
| AI プロバイダ | **Gemini API 統一** | `pii-masking-design.md §1.3` と整合。API キー・レート管理が一本化 |
| 生成モデル | `gemini-1.5-flash` | 要約・ドラフト用途では精度より速度・コスト優先。Vercel 関数のタイムアウト 60 秒内で応答 |
| 埋め込みモデル | `text-embedding-004`（768 次元） | `knowledge-context-design.md §1.2` で確定済み |
| 出力形式 | **JSON モード強制 + Zod 検証** | 自由記述パースのリトライ地獄を避ける。構造化レスポンスが本質 |
| プロンプト管理 | **ディレクトリバージョニング** | `prompts/v1/*.ts` → 変更時 `v2/` を追加し `ai_generation_logs.prompt_template_id` で追跡 |
| 再試行戦略 | **JSON パース失敗時のみ最大 2 回** | 業務エラーは再試行せず `UseCaseError` 化して UI に伝える |
| ストリーミング | **非対応（MVP）** | `care-manager-ai-design.md §10.2` で確定済み |

### 1.3 採用しなかった選択肢

| 選択肢 | 採用しなかった理由 |
|--------|------------------|
| プロンプトを DB 管理（`prompts` テーブル） | バージョン差分の追跡は Git の方が容易。MVP では過剰 |
| LangChain / LlamaIndex 等のフレームワーク | Gemini SDK 直接呼び出しの方が制御が効く。責務が薄いので独自実装で充分 |
| OpenAI Function Calling 相当の抽象化 | Gemini の `responseSchema` で充分。抽象化レイヤは実装が増えるだけ |
| プロンプトの多言語化 | MVP は日本語のみ |

---

## 2. レイヤ構造と責務分離

### 2.1 全体構造

```
┌──────────────────────────────────────────────┐
│ ユースケース層（application/）                 │
│  - PrepareAssessmentDraftUseCase              │
│  - GenerateAssessmentFromMaskedTextUseCase    │
│  - GenerateCarePlanDraftUseCase               │
│  - DraftEmailReplyUseCase                     │
└──────────────────┬───────────────────────────┘
                   │ ドメインインターフェース経由
                   ▼
┌──────────────────────────────────────────────┐
│ ドメイン層（domain/ai-support/）                │
│  - IAiSummarizationService                    │
│  - ICarePlanGenerationService                 │
│  - IEmailReplyDraftService                    │
│  - IEmbeddingService                          │
│  - IAiGenerationLogRepository                 │
└──────────────────┬───────────────────────────┘
                   │ DI で注入
                   ▼
┌──────────────────────────────────────────────┐
│ インフラ層（infrastructure/ai/）                │
│  【高レイヤサービス】                            │
│   - GeminiAiSummarizationService              │
│   - GeminiCarePlanGenerationService           │
│   - GeminiEmailReplyDraftService              │
│   - GeminiEmbeddingService                    │
│   （責務: プロンプト組み立て + Zod パース +     │
│    ドメインインターフェース実装）                │
│         ↓                                    │
│  【低レイヤクライアント】                        │
│   - GeminiClient                              │
│   （責務: API 呼び出し・認証・リトライ・         │
│    トークン集計・レート制御）                    │
│         ↓                                    │
│  【プロンプト定義】                              │
│   - prompts/v1/assessment-summarization.ts    │
│   - prompts/v1/care-plan-draft.ts             │
│   - prompts/v1/email-reply-draft.ts           │
│  【スキーマ定義】                                │
│   - schemas/assessment-summarization.ts       │
│   - schemas/care-plan-draft.ts                │
│   - schemas/email-reply-draft.ts              │
└──────────────────────────────────────────────┘
```

### 2.2 責務分離の原則

| レイヤ | 持つべきもの | 持ってはいけないもの |
|-------|------------|-------------------|
| ドメインインターフェース | 業務意図に沿った入力・出力の型 | Gemini 固有用語、HTTP 詳細、再試行ロジック |
| 高レイヤサービス | プロンプト組み立て、Zod パース、業務例外への変換 | HTTP 呼び出し、認証、トークン集計 |
| `GeminiClient` | HTTP 呼び出し、認証、リトライ、トークン集計、レート制御 | 業務用語、プロンプト文面 |
| プロンプト定義 | テンプレート文字列、変数プレースホルダ | 呼び出しロジック、Zod 検証 |
| スキーマ定義 | Zod スキーマと対応する TypeScript 型 | プロンプト文面 |

---

## 3. プロンプトテンプレート設計

### 3.1 ディレクトリ構造

```
infrastructure/ai/
├── prompts/
│   └── v1/
│       ├── assessment-summarization.ts
│       ├── care-plan-draft.ts
│       ├── email-reply-draft.ts
│       └── shared.ts               // 共通プリアンブル・フォーマットルール
├── schemas/
│   ├── assessment-summarization.ts
│   ├── care-plan-draft.ts
│   └── email-reply-draft.ts
├── GeminiClient.ts
├── GeminiAiSummarizationService.ts
├── GeminiCarePlanGenerationService.ts
├── GeminiEmailReplyDraftService.ts
└── GeminiEmbeddingService.ts
```

### 3.2 テンプレートの基本契約

各プロンプトファイルは以下の契約をエクスポートする。

```typescript
// infrastructure/ai/prompts/v1/types.ts

export interface PromptTemplate<TVars extends Record<string, unknown>> {
  /** `ai_generation_logs.prompt_template_id` に記録する識別子 */
  readonly id: string;                // 例: 'v1-assessment-summarization'
  /** Gemini に渡す system instruction 相当のテキスト */
  readonly systemInstruction: string;
  /** テンプレート + 変数で組み立てられる user prompt */
  build(vars: TVars): string;
  /** モデルに強制する JSON スキーマ（Zod 由来の JSON Schema 表現） */
  readonly responseJsonSchema: Record<string, unknown>;
  /** Gemini 呼び出しパラメータの既定値 */
  readonly generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}
```

### 3.3 プロンプト 1: アセスメント要約

**目的**: マスク済み音声原文から、課題・ニーズを構造化抽出する。

```typescript
// infrastructure/ai/prompts/v1/assessment-summarization.ts

import { assessmentSummarizationResponseJsonSchema }
  from '../../schemas/assessment-summarization';

export interface AssessmentSummarizationVars {
  /** マスク済み音声原文（PII はプレースホルダに置換済み） */
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
  responseJsonSchema: assessmentSummarizationResponseJsonSchema,
  generationConfig: {
    temperature: 0.2,        // 業務記述の再現性優先
    maxOutputTokens: 2048,
  },
};
```

**few-shot 例の扱い**: MVP では system instruction に埋め込まず、実運用で精度問題が出たら `build()` に 1〜2 例を追加する方針（トークンコストを先行投資しない）。

### 3.4 プロンプト 2: ケアプランドラフト生成

**目的**: Finalized アセスメント + 利用者属性 + RAG 検索結果から、長期目標・短期目標・サービス候補を生成する。

```typescript
// infrastructure/ai/prompts/v1/care-plan-draft.ts

export interface CarePlanDraftVars {
  assessmentMaskedSummary: string;
  issuesMasked: Array<{
    category: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  recipientContext: {
    careLevel: string;         // 'support_1' 〜 'care_5'
    ageRange: '60代' | '70代' | '80代' | '90代以上';
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
  responseJsonSchema: carePlanDraftResponseJsonSchema,
  generationConfig: {
    temperature: 0.3,
    maxOutputTokens: 4096,
  },
};
```

### 3.5 プロンプト 3: メール返信ドラフト

**目的**: ケアマネが貼り付けた受信メール本文（マスク済み）から、返信ドラフトを生成する。

```typescript
// infrastructure/ai/prompts/v1/email-reply-draft.ts

export interface EmailReplyDraftVars {
  maskedIncomingEmail: string;
  intent?: string;             // "丁寧に断る" "日程調整を提案" 等
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
  responseJsonSchema: emailReplyDraftResponseJsonSchema,
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 1024,
  },
};
```

### 3.6 バージョン管理の運用

| 変更種別 | 対応 |
|---------|------|
| 軽微な文言調整（文法修正・誤字） | `v1/` を直接編集。`prompt_template_id` は同じまま |
| プロンプト構造の変更、出力スキーマの変更 | `v2/` ディレクトリを新規作成し、旧版はアーカイブ。`prompt_template_id` を `v2-<kind>` に更新 |
| DI コンテナ | 実装中の「現行版」を注入。過去の `prompt_template_id` は `ai_generation_logs` の歴史として残る |

**なぜ DB 管理しないか**: プロンプトは Git と PR レビューで変更を管理するのが最も効率的。DB テーブル化するとバージョン切替のオペレーションコードが増えるだけで、Git と同じことをする。

---

## 4. JSON レスポンススキーマ（Zod）

### 4.1 Zod スキーマの役割

- Gemini `responseSchema` を Zod から導出（単一ソース）
- ランタイムで応答を `parse()` して型安全な TypeScript 値にする
- パース失敗はサーバーログに記録し、`UseCaseError('INTERNAL_ERROR')` として UI へ伝播

### 4.2 アセスメント要約スキーマ

```typescript
// infrastructure/ai/schemas/assessment-summarization.ts
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

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
  zodToJsonSchema(AssessmentSummarizationResponseSchema, {
    target: 'openApi3',
  });
```

### 4.3 ケアプランドラフトスキーマ

```typescript
// infrastructure/ai/schemas/care-plan-draft.ts

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
```

### 4.4 メール返信ドラフトスキーマ

```typescript
// infrastructure/ai/schemas/email-reply-draft.ts

export const EmailReplyDraftResponseSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(3000),
});

export type EmailReplyDraftResponse = z.infer<typeof EmailReplyDraftResponseSchema>;
```

### 4.5 パース失敗時の挙動

```typescript
// infrastructure/ai/GeminiAiSummarizationService.ts (抜粋)

async summarizeAsAssessment(input: { maskedText: string }) {
  const prompt = assessmentSummarizationPromptV1;
  const vars = { maskedTranscript: input.maskedText };

  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await this.gemini.generateJson({
      systemInstruction: prompt.systemInstruction,
      userPrompt: prompt.build(vars),
      responseSchema: prompt.responseJsonSchema,
      generationConfig: prompt.generationConfig,
    });

    const parsed = AssessmentSummarizationResponseSchema.safeParse(raw.json);
    if (parsed.success) {
      return {
        summary: parsed.data.summary,
        issues: parsed.data.issues,
        rawResponse: raw.rawResponse,
        promptTemplateId: prompt.id,
        tokenUsage: raw.tokenUsage,
      };
    }
    lastError = parsed.error;
    console.warn(`[AiSummarization] parse failed (attempt ${attempt})`, parsed.error);
  }
  throw new Error(`Gemini JSON response failed to parse after 2 attempts: ${lastError}`);
}
```

**再試行しない方針の判断**:
- ネットワーク由来の 5xx は `GeminiClient` 側でリトライ（§5.2）
- 業務的な失敗（不正なプロンプト設計など）は再試行で直らない → 早く失敗させて監視に乗せる
- 2 回で見切る（3 回以上は待ち時間が伸びるだけ）

---

## 5. GeminiClient（低レイヤ）

### 5.1 責務

- Gemini REST API へのリクエスト発行
- API キーの環境変数取得
- HTTP リトライ（5xx・レート制限）
- トークン集計・レイテンシ測定
- レスポンス JSON の一次検証（`responseSchema` 由来の型安全）

### 5.2 インターフェース

```typescript
// infrastructure/ai/GeminiClient.ts

export interface GeminiGenerateJsonParams {
  systemInstruction: string;
  userPrompt: string;
  responseSchema: Record<string, unknown>;
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}

export interface GeminiGenerateJsonResult {
  /** パース前の JSON（Zod で型安全に扱う前の生構造） */
  json: unknown;
  /** 監査ログ用の生レスポンス（Gemini API のメタ情報込み） */
  rawResponse: unknown;
  tokenUsage: {
    requestTokens: number;
    responseTokens: number;
  };
  latencyMs: number;
}

export interface GeminiEmbedParams {
  text: string;
  taskType?: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';
}

export class GeminiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = 'gemini-1.5-flash',
    private readonly embeddingModel: string = 'text-embedding-004',
  ) {}

  async generateJson(params: GeminiGenerateJsonParams): Promise<GeminiGenerateJsonResult> { /* ... */ }

  async embed(params: GeminiEmbedParams): Promise<{ values: number[] }> { /* ... */ }
}
```

### 5.3 リトライ方針

| エラー種別 | リトライ | バックオフ |
|-----------|---------|----------|
| HTTP 5xx | 最大 2 回 | 500ms → 2000ms（指数） |
| HTTP 429（レート制限） | 最大 2 回 | `Retry-After` ヘッダ優先、なければ 2000ms |
| HTTP 4xx（400/403 等） | **リトライしない** | 即座に例外。プロンプト・認証設定のバグを疑う |
| ネットワークタイムアウト | 最大 1 回 | 1000ms |
| JSON パース不可（スキーマ違反） | リトライしない | 高レイヤで処理（§4.5） |

### 5.4 トークン集計とコスト監視

- `GeminiClient` は全呼び出しで `requestTokens` / `responseTokens` / `latencyMs` を返す
- 高レイヤサービスはこの値を `ai_generation_logs` に記録
- コスト監視は後続フェーズ（`care-manager-ai-design.md §10.6`）で Grafana ダッシュボード化予定

---

## 6. 高レイヤサービス（ドメインインターフェース実装）

### 6.1 ドメインインターフェース定義

```typescript
// domain/ai-support/IAiSummarizationService.ts

export interface IAiSummarizationService {
  summarizeAsAssessment(input: {
    maskedText: string;
  }): Promise<{
    summary: string;
    issues: Array<{ category: IssueCategory; description: string; priority: IssuePriority }>;
    rawResponse: unknown;
    promptTemplateId: string;
    tokenUsage: { requestTokens: number; responseTokens: number };
  }>;
}

// domain/ai-support/ICarePlanGenerationService.ts

export interface ICarePlanGenerationService {
  generateDraft(input: {
    assessmentMaskedSummary: string;
    issuesMasked: Array<{ category: IssueCategory; description: string; priority: IssuePriority }>;
    recipientContext: { careLevel: string; ageRange: string };
    knowledgeSnippets: Array<{ title: string; text: string; source: string; similarity: number }>;
  }): Promise<{
    longTermGoals: /* ... */;
    shortTermGoals: /* ... */;
    serviceItemCandidates: /* ... */;
    citations: Array<{ knowledgeIndex: number; usedFor: string }>;
    rawResponse: unknown;
    promptTemplateId: string;
    tokenUsage: { requestTokens: number; responseTokens: number };
  }>;
}

// domain/ai-support/IEmailReplyDraftService.ts

export interface IEmailReplyDraftService {
  draft(input: {
    maskedIncomingEmail: string;
    intent?: string;
  }): Promise<{
    draftReply: string;           // subject と body を整形済み単一テキスト、または分離版
    rawResponse: unknown;
    promptTemplateId: string;
    tokenUsage: { requestTokens: number; responseTokens: number };
  }>;
}

// domain/ai-support/IEmbeddingService.ts

export interface IEmbeddingService {
  embed(text: string): Promise<EmbeddingVector>;
}
```

### 6.2 実装例: GeminiCarePlanGenerationService

```typescript
// infrastructure/ai/GeminiCarePlanGenerationService.ts

export class GeminiCarePlanGenerationService implements ICarePlanGenerationService {
  constructor(private readonly gemini: GeminiClient) {}

  async generateDraft(input: CarePlanDraftInput): Promise<CarePlanDraftOutput> {
    const prompt = carePlanDraftPromptV1;
    const vars: CarePlanDraftVars = {
      assessmentMaskedSummary: input.assessmentMaskedSummary,
      issuesMasked: input.issuesMasked,
      recipientContext: input.recipientContext,
      knowledgeSnippets: input.knowledgeSnippets.map(k => ({
        title: k.title, text: k.text, source: k.source,
      })),
    };

    for (let attempt = 1; attempt <= 2; attempt++) {
      const raw = await this.gemini.generateJson({
        systemInstruction: prompt.systemInstruction,
        userPrompt: prompt.build(vars),
        responseSchema: prompt.responseJsonSchema,
        generationConfig: prompt.generationConfig,
      });
      const parsed = CarePlanDraftResponseSchema.safeParse(raw.json);
      if (parsed.success) {
        return {
          longTermGoals: parsed.data.longTermGoals,
          shortTermGoals: parsed.data.shortTermGoals,
          serviceItemCandidates: parsed.data.serviceItemCandidates,
          citations: parsed.data.citations,
          rawResponse: raw.rawResponse,
          promptTemplateId: prompt.id,
          tokenUsage: raw.tokenUsage,
        };
      }
    }
    throw new Error('CarePlanDraft: Gemini JSON parse failed after 2 attempts');
  }
}
```

**なぜ各高レイヤサービスを分けるのか**:
- ドメインインターフェース（`ICarePlanGenerationService` など）は**業務意図**で分かれている。そこに合わせる
- プロンプト 3 種類を 1 クラスに詰めるより、ファイル単位で変更理由が一意になる
- 将来別のモデル（例: OpenAI）に差し替える場合も、ユースケース単位で移行できる

---

## 7. `IAiGenerationLogRepository`

### 7.1 位置づけ

`ai_generation_logs` テーブル（DDL は `pii-masking-design.md §6.2`）への永続化責務を担う。**本ドキュメントがインターフェースの単一ソース**。

### 7.2 インターフェース

```typescript
// domain/ai-support/IAiGenerationLogRepository.ts

export type AiGenerationKind =
  | 'assessment_summarization'
  | 'care_plan_draft'
  | 'email_reply_draft';

export interface AiGenerationLogRecord {
  tenantId: TenantId;
  kind: AiGenerationKind;

  /** kind='email_reply_draft' の場合は NOT NULL、その他は NULL（集約側が単一ソース） */
  originalText: string | null;
  maskedText: string;
  placeholderMap: Array<{
    token: string;
    category: string;
    /** 集約側が保持する場合は含めない（PII 露出最小化） */
    originalValue?: string;
  }>;
  maskingStats?: MaskingStatistics;

  aiResponse: unknown;
  aiModel: string;                 // 例: 'gemini-1.5-flash'
  promptTemplateId: string;        // 例: 'v1-assessment-summarization'

  relatedEntityType?: 'assessment' | 'care_plan';
  relatedEntityId?: string;

  createdBy: UserId;

  requestTokens?: number;
  responseTokens?: number;
  latencyMs?: number;
}

export interface IAiGenerationLogRepository {
  save(record: AiGenerationLogRecord): Promise<void>;
}
```

### 7.3 保存項目の設計判断

| 項目 | 設計判断 |
|------|---------|
| `originalText` NULLABLE | 集約（`assessments.source_transcript` 等）が単一ソースを保持する場合は NULL。`pii-masking-design.md §6.2 §6.3` の方針に準拠 |
| `placeholder_map.originalValue` は条件付き | 集約側が保持する場合は省略して PII 露出を減らす。メール返信のように関連集約がない場合のみ必要 |
| `aiResponse` を JSONB で保存 | Gemini の生レスポンス（メタ情報含む）を丸ごと残す。将来スキーマ変更があっても追跡可能 |
| `promptTemplateId` 必須 | バージョン変更時に「どのプロンプトで生成したか」を事後検証できる |
| `requestTokens` / `responseTokens` / `latencyMs` | コスト・レイテンシ監視の基礎データ。将来の Grafana 可視化で使用 |

### 7.4 既存のユースケースからの呼び出し（整合確認）

| ユースケース | 呼び出し箇所 |
|------------|------------|
| `GenerateAssessmentFromMaskedTextUseCase` | `pii-masking-design.md §5.3` ステップ 5 & 7 で呼び出し済み |
| `GenerateCarePlanDraftUseCase` | `care-manager-ai-design.md §7.7` ステップ 4 で呼び出し済み |
| `DraftEmailReplyUseCase` | `care-manager-ai-design.md §7.6.1` ステップ 4 で呼び出し済み |

上記ユースケースの既存コード例を本ドキュメントの型に合わせて読み替える（フィールド名の統一）。

---

## 8. モデル選定と運用パラメータ

### 8.1 用途別モデル

| 用途 | モデル | 根拠 |
|------|-------|------|
| アセスメント要約 | `gemini-1.5-flash` | レイテンシ < 10 秒を目標。精度は few-shot で底上げ |
| ケアプランドラフト | `gemini-1.5-flash` | 同上。RAG で情報補強する方針のため、モデル単体の知識量は `flash` で足りる |
| メール返信ドラフト | `gemini-1.5-flash` | 短文生成、`flash` で充分 |
| 埋め込み | `text-embedding-004` | 768 次元。`knowledge-context-design.md §1.2` で確定済み |

**`gemini-1.5-pro` への切り替え条件**:
- `flash` で要約精度が運用に耐えないと判断された場合
- 切り替え時は `GeminiClient` の `model` パラメータ変更のみで済む

### 8.2 トークン想定

| ユースケース | 入力 | 出力 | 合計 |
|------------|------|------|------|
| アセスメント要約 | 〜 3,000 tokens（音声原文マスク後） | 〜 1,500 tokens | 〜 4,500 |
| ケアプランドラフト | 〜 6,000 tokens（アセスメント + 課題 + RAG 5 件） | 〜 3,000 tokens | 〜 9,000 |
| メール返信ドラフト | 〜 1,500 tokens（受信メール） | 〜 800 tokens | 〜 2,300 |
| 埋め込み（1 チャンク） | 〜 800 tokens | 768 次元ベクトル | - |

**この想定を超える場合**: Vercel 関数タイムアウトと Gemini レート制限に注意。`maxOutputTokens` は各プロンプトで抑制済み（§3.3〜§3.5）。

### 8.3 レート制限への対応

| 場面 | 戦略 |
|------|------|
| Embedding バッチ（ナレッジ処理） | `knowledge-context-design.md §8.3` の通り 1 チャンクずつ逐次 |
| ユーザー操作起動の要約・ドラフト | 同時実行数は Vercel Pro の関数並列度上限に依存。MVP は制御なしで様子見 |
| レート超過時 | `GeminiClient` がリトライ（§5.3）、超過が続けば 5xx として UI 表示 |

---

## 9. テスト方針

### 9.1 ドメインインターフェースのモック

ユースケース単体テストでは `IAiSummarizationService` などを in-memory で実装してモック。実際の Gemini 呼び出しはしない。

```typescript
class FakeAiSummarizationService implements IAiSummarizationService {
  async summarizeAsAssessment(input: { maskedText: string }) {
    return {
      summary: 'テスト要約',
      issues: [{ category: 'health', description: 'テスト課題', priority: 'high' }],
      rawResponse: {},
      promptTemplateId: 'test-v1',
      tokenUsage: { requestTokens: 100, responseTokens: 50 },
    };
  }
}
```

### 9.2 プロンプト自体のテスト

| テスト | 確認事項 |
|-------|---------|
| スナップショット（`build()` 出力） | 変数埋め込み後のプロンプト文字列が想定通り |
| Zod スキーマ往復 | `zodToJsonSchema` の出力が Gemini が受け付ける形式になっている |
| 出力例の `safeParse` | 実際の Gemini 応答例（録画）が Zod で通ること |

### 9.3 GeminiClient の統合テスト（オプション）

- API キーが設定された環境変数でのみ実行（`process.env.GEMINI_API_KEY`）
- CI では skip、手動実行 or 週次ジョブ

---

## 10. MVP 優先度マトリクス

### 10.1 ドメイン層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `IAiSummarizationService` / `ICarePlanGenerationService` / `IEmailReplyDraftService` / `IEmbeddingService` インターフェース |
| 🔴 必須 | `IAiGenerationLogRepository` インターフェース |
| 🟡 推奨 | ドメイン側の型（`IssueCategory` 等）の再利用 |

### 10.2 プロンプト層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | 3 種類のプロンプトテンプレート（`v1/`） |
| 🔴 必須 | Zod スキーマ + `zodToJsonSchema` での JSON Schema 生成 |
| 🟡 推奨 | few-shot 例の追加（MVP 運用後、精度を見て判断） |
| 🟢 後回し | プロンプト A/B テスト基盤 |

### 10.3 インフラ層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `GeminiClient`（HTTP + リトライ + トークン集計） |
| 🔴 必須 | 3 種類の高レイヤサービス + `GeminiEmbeddingService` |
| 🔴 必須 | `SupabaseAiGenerationLogRepository` 実装 |
| 🟡 推奨 | トークン集計の Grafana 送信（後続フェーズ） |
| 🟢 後回し | モデル切り替え用の DI コンテナ拡張 |

### 10.4 運用監視

| 優先度 | 項目 |
|--------|------|
| 🟡 推奨 | `ai_generation_logs` からのコスト・レイテンシ集計クエリ |
| 🟢 後回し | Grafana ダッシュボード（`care-manager-ai-design.md §10.6`） |
| 🟢 後回し | プロンプト品質の自動評価（LLM-as-judge 等） |

---

## 11. 未決定事項・今後の論点

| 論点 | 判断時期 | MVP 既定動作 |
|------|---------|------------|
| `gemini-1.5-flash` の精度が業務で許容されるか | 運用 2 ヶ月後のフィードバック | `flash` 継続。問題が出れば `pro` 切り替え |
| few-shot 例の追加タイミングと内容 | 精度が不足した時点 | システム指示のみで運用開始 |
| プロンプトテンプレートの DB 管理化 | 変更頻度が週 1 回を超えたら | Git + コード定数のまま |
| A/B テスト基盤 | プロンプト改善が主要業務になったら | 単一バージョン運用 |
| ストリーミング対応 | `care-manager-ai-design.md §10.2` | MVP スコープ外 |
| コスト予算アラート | 月間コストが予算 80% に達した時点で追加 | 手動監視 |

---

## 付録 A: 用語集

| 用語 | 定義 |
|------|------|
| プロンプトテンプレート | Gemini に渡す system instruction + user prompt + 生成パラメータのセット |
| `responseSchema` | Gemini が JSON モードで従う JSON Schema。Zod から導出 |
| 高レイヤサービス | ドメインインターフェースを実装する Gemini 特化クラス。プロンプト組み立てと Zod パースを担う |
| 低レイヤクライアント | `GeminiClient`。HTTP 呼び出し・認証・リトライを担う |
| `prompt_template_id` | `v1-<kind>` 形式の識別子。`ai_generation_logs.prompt_template_id` に記録 |
| `few-shot` | プロンプトに入出力例を含めて精度を上げる手法 |

---

## 付録 B: 他ドキュメントとのクロスリンク

| 項目 | 参照先 |
|------|-------|
| `IPiiMaskingService` | `pii-masking-design.md §3.3` |
| `MaskingResult` 値オブジェクト | `pii-masking-design.md §3.2` |
| `ai_generation_logs` テーブル DDL | `pii-masking-design.md §6.2` |
| `assessments.source_transcript` 単一ソース方針 | `pii-masking-design.md §6.2 §6.3` / `assessment-aggregate-design.md §6.4` |
| アセスメント集約との接続 | `assessment-aggregate-design.md §8.1` |
| `IEmbeddingService` の埋め込み利用 | `knowledge-context-design.md §8.3` |
| RAG 結果への再マスキング | `knowledge-context-design.md §7.3` |
| ケアプランドラフト生成の全体フロー | `care-plan-aggregate-design.md §8.1`（作成後） |
| 境界づけられたコンテキストにおける AI 支援の位置づけ | `care-manager-ai-design.md §3.1` |

---

**ドキュメントバージョン**: 0.1（新規作成）
**最終更新**: 2026-04-24
**0.1 の主な変更点**:
- 新規作成。`care-manager-ai-design.md §10.2` の「プロンプトテンプレート管理」「AI 生成結果スキーマ検証」「Gemini クライアント抽象化」の方針を詳細化
- `IAiGenerationLogRepository` の単一ソースとして統合（従来は `care-manager-ai-design.md` / `pii-masking-design.md` に分散）
