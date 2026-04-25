# AI支援コンテキスト: PIIマスキング戦略 設計ドキュメント

> 本ドキュメントは `care-manager-ai-design.md` のセクション「10.2 AI 支援コンテキストの設計」を詳細化したもの。
> ケアマネAI支援アプリにおける個人情報保護の中核戦略を定義する。

**ドキュメントバージョン**: 0.2 (実装前レビュー反映版)
**最終更新**: 2026-04-23
**親ドキュメント**: `care-manager-ai-design.md`

---

## 1. 背景と要件の整理

### 1.1 課題

ケアマネAI支援アプリでは、利用者の音声記録や利用者属性を Gemini API に送信して要約・ケアプランドラフト生成を行う。
利用者は要介護高齢者であり、扱うデータには以下が含まれる:

- 氏名・住所・電話番号・生年月日(明確なPII)
- 疾患名・服薬情報・ADL状況(医療情報)
- 同居家族の氏名・続柄・連絡先(家族情報)

これらを「絶対に外部APIに漏らさない」ことが本アプリの法的・倫理的な必須要件。

### 1.2 適用される法的根拠

| 法令 | 適用範囲 |
|------|---------|
| 個人情報保護法 | 利用者の個人情報全般。第三者提供にあたる外部API送信は原則同意が必要 |
| 介護保険法 | ケアプラン情報の取り扱い。事業所の守秘義務 |
| 医療情報安全管理ガイドライン | 疾患・治療情報の取り扱い基準 |

### 1.3 確定した設計方針(意思決定の記録)

| 項目 | 採用方針 | 決定理由 |
|------|---------|---------|
| AIプロバイダ | **Gemini API に統一**(要約・ドラフト生成は `gemini-1.5-flash`、埋め込みは `text-embedding-004`) | 設計ドキュメント全体で Gemini 前提。要件定義書も Gemini に統一済み |
| マスキング粒度 | **氏名・住所・電話・生年月日 + 疾患名・服薬・家族関係まで** | 利用者の特定可能性を最大限排除する保守的方針 |
| 失敗リスク許容度 | **絶対NG。送信前ブロック・人手確認が必要** | 個情法上のインシデント発生時の影響が大きすぎる |
| マスキングアーキテクチャ | **レイヤー1(構造化置換) + レイヤー3(人手確認ゲート)** | LLMマスキングは見逃しが避けられないため見送り。人手確認を業務フローに組み込む |
| アンマスキング | **画面表示時のみ。DB保存はマスク済みのまま** | 漏洩リスク最小化。一貫性・監査性を優先 |
| データ保存 | **原文 + マスク済みテキストの両方を保存** | 監査証跡として「何をAIに送ったか」を残す。再生成可能性も確保 |

---

## 2. アーキテクチャ概要

### 2.1 採用アーキテクチャ: 2層防御

```
┌─────────────────────────────────────────────────┐
│ レイヤー1: 構造化データの差し替え (確実な置換)      │
│   - DB に既知のPII (氏名・住所・電話・生年月日)     │
│   - 正規表現パターン (電話・郵便番号など)           │
│   - → プレースホルダ {RECIPIENT_NAME} に必ず置換   │
└─────────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ レイヤー3: 人手確認ゲート (送信前プレビュー)         │
│   - マスキング結果を画面に表示                      │
│   - 原文とマスク後の差分をハイライト                │
│   - ユーザーが「この内容で送信」を押すまで送らない    │
│   - 追加マスキング・キャンセルが可能                │
└─────────────────────────────────────────────────┘
                       ↓
                  Gemini API へ送信
```

### 2.2 採用しなかった選択肢の記録

| 選択肢 | 採用しなかった理由 |
|--------|------------------|
| レイヤー2(LLMによる固有名詞・医療情報の自動マスキング) | 精度100%の保証ができず、「絶対NG」要件と矛盾。MVP後に補助層として追加検討 |
| 全自動マスキング(人手確認なし) | LLM・正規表現どちらでも見逃しが発生し、「絶対NG」要件を満たせない |
| マスキングなし(規約上問題なしと整理) | 個情法・利用者からの信頼性確保の観点で採用不可 |

### 2.3 全体フロー

```
[ユーザー操作]                    [システム処理]
─────────────────────────────────────────────────
音声録音/入力
   ↓
文字起こし(Web Speech API)
   ↓
原文テキスト確定
   ↓                              ↓
                          【UseCase 1: PrepareAssessmentDraftUseCase】
                          ① 利用者DBから既知PIIを取得
                          ② レイヤー1: 構造化置換実行
                             "田中太郎" → "{RECIPIENT_NAME}"
                             "090-xxxx-xxxx" → "{PHONE_001}"
                          ③ MaskingResult を返す(まだ送信しない)
   ↓
【プレビュー画面に表示】
左:原文 / 右:マスク後 (差分ハイライト)
   ↓
ユーザーが確認・必要なら手動編集
   ↓
「この内容でAI要約」ボタン押下
   ↓                              ↓
                          【UseCase 2: GenerateAssessmentFromMaskedTextUseCase】
                          ① 確認済みmaskedTextをGeminiに送信
                          ② Gemini応答(課題リスト等、プレースホルダ入り)
                          ③ Assessment集約を生成
                          ④ ai_generation_logs に
                             original/masked両方を保存
                          ⑤ アンマスクはせずに返却
   ↓
【画面表示時にアンマスク】
{RECIPIENT_NAME} → "田中太郎"
```

**この設計の本質的な強み**:
ユースケースを「マスキング準備」と「AI送信」の2段階に分割することで、
**人手確認を経ずに Gemini に送られる経路がコード上存在しない**ことを構造的に保証できる。

---

## 3. ドメインモデル設計

### 3.1 値オブジェクト: PiiPlaceholder

プレースホルダーを値オブジェクトとして表現し、カテゴリ・トークン・元の値を一元管理する。

```typescript
// domain/ai-support/masking/PiiPlaceholder.ts

export class PiiPlaceholder {
  private constructor(
    public readonly category: PiiCategory,
    public readonly token: string,         // "{RECIPIENT_NAME_001}"
    public readonly originalValue: string, // "田中太郎"
  ) {}

  static create(
    category: PiiCategory,
    originalValue: string,
    sequence: number,
  ): PiiPlaceholder {
    const token = `{${category.toUpperCase()}_${String(sequence).padStart(3, '0')}}`;
    return new PiiPlaceholder(category, token, originalValue);
  }
}

export type PiiCategory =
  | 'recipient_name'      // 利用者氏名
  | 'family_name'         // 家族氏名(同居家族など)
  | 'phone'               // 電話番号
  | 'address'             // 住所
  | 'postal_code'         // 郵便番号
  | 'birth_date'          // 生年月日
  | 'email'               // メールアドレス
  | 'facility_name'       // 施設名・事業所名
  | 'caregiver_name';     // 介護者(ヘルパー等)氏名
```

### 3.2 値オブジェクト: MaskingResult

マスキング処理の結果を値オブジェクトとして集約。アンマスクなどのドメインロジックを持つ。

```typescript
// domain/ai-support/masking/MaskingResult.ts

export class MaskingResult {
  private constructor(
    public readonly originalText: string,
    public readonly maskedText: string,
    public readonly placeholders: ReadonlyArray<PiiPlaceholder>,
    public readonly maskedAt: Date,
  ) {}

  static create(params: {
    originalText: string;
    maskedText: string;
    placeholders: PiiPlaceholder[];
  }): MaskingResult {
    if (params.maskedText.length === 0 && params.originalText.length > 0) {
      throw new MaskingError('マスク後テキストが空になっています');
    }
    return new MaskingResult(
      params.originalText,
      params.maskedText,
      params.placeholders,
      new Date(),
    );
  }

  /** AI応答テキスト中のプレースホルダを元の値に戻す(画面表示用のみ) */
  unmask(textWithPlaceholders: string): string {
    let result = textWithPlaceholders;
    for (const p of this.placeholders) {
      result = result.replaceAll(p.token, p.originalValue);
    }
    return result;
  }

  /** マスキング統計(監査・デバッグ用) */
  get statistics(): MaskingStatistics {
    return {
      totalPlaceholders: this.placeholders.length,
      byCategory: this.placeholders.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      }, {} as Record<PiiCategory, number>),
    };
  }
}

export interface MaskingStatistics {
  totalPlaceholders: number;
  byCategory: Record<PiiCategory, number>;
}
```

### 3.3 ドメインサービスインターフェース

> **位置づけ**: `IPiiMaskingService` は AI 支援コンテキストのうち「マスキング責務」のみを担う。プロンプト管理・Gemini 呼び出し・JSON レスポンス検証・AI 生成ログは `ai-support-context-design.md` の各インターフェース（`IAiSummarizationService` / `ICarePlanGenerationService` / `IEmailReplyDraftService` / `IEmbeddingService` / `IAiGenerationLogRepository`）で扱う。

```typescript
// domain/ai-support/masking/IPiiMaskingService.ts

export interface IPiiMaskingService {
  /**
   * 構造化PIIマスキング(レイヤー1)
   * @param text マスキング対象のテキスト
   * @param knownPiis DBから取得した既知のPII情報
   */
  mask(text: string, knownPiis: KnownPiiSet): Promise<MaskingResult>;
}

/**
 * 利用者DB等から取得した「既知のPII」のセット
 * これに基づいて確実な置換を行う
 */
export interface KnownPiiSet {
  recipientName: string;            // 利用者氏名(必須)
  recipientNameAliases?: string[];  // ニックネーム・敬称付きパターン
  familyMembers?: Array<{ name: string; relation: string }>;
  phones?: string[];
  addresses?: string[];
  postalCodes?: string[];
  birthDate?: string;
}
```

### 3.4 設計判断のポイント

| 判断 | 理由 |
|------|------|
| `mask()` が `KnownPiiSet` を引数に取る | レイヤー1は「既知PIIの置換」が本質。ドメインから明示的に渡す |
| 戻り値を `MaskingResult` 値オブジェクトに | アンマスクや統計などのドメインロジックを集約できる |
| `unmask()` を `MaskingResult` のメソッドに | placeholderMap を持っている本人がアンマスクするのが自然 |
| プレースホルダのフォーマットを統一 | Gemini が認識しやすい固定パターン `{CATEGORY_001}` |
| カテゴリを ENUM ではなく文字列リテラル型 | TypeScript の型安全性を維持しつつ、追加が容易 |

---

## 4. レイヤー1: 正規表現パターン検出の推奨セット

### 4.1 設計方針

MVP では「**安全側に倒した最小限のパターン**」を実装し、運用しながら拡張する。
誤検出(過剰マスキング)は人手確認で巻き戻せるが、**見逃しは取り返しがつかない**ため、迷ったら検出側に倒す。

### 4.2 MVP 実装推奨パターン

| カテゴリ | パターン例 | 正規表現 | MVP優先度 | 備考 |
|---------|-----------|---------|----------|------|
| 電話番号 | 090-1234-5678, 03-1234-5678, 0312345678 | `\d{2,4}-?\d{2,4}-?\d{4}` | 🔴 必須 | ハイフン有無両対応 |
| 携帯番号(070/080/090) | 同上 | 上記に含まれる | 🔴 必須 | 通常パターンでカバー可能 |
| メールアドレス | example@domain.com | `[\w.+-]+@[\w-]+\.[\w.-]+` | 🔴 必須 | RFC完全準拠は不要 |
| 郵便番号 | 123-4567, 1234567 | `\d{3}-?\d{4}` | 🔴 必須 | ハイフン有無両対応 |
| 生年月日(西暦) | 1945年1月1日, 1945/01/01, 1945-01-01 | `\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?` | 🟡 推奨 | 計算処理が複雑になる場合あり |
| 生年月日(和暦) | 昭和20年1月1日 | `(明治\|大正\|昭和\|平成\|令和)\d{1,2}年\d{1,2}月\d{1,2}日` | 🟡 推奨 | ケアマネ業務では頻出 |
| マイナンバー | 12桁数字 | `\d{4}\s?\d{4}\s?\d{4}` | 🟢 後回し | アプリで扱う想定なし |
| 介護保険番号 | 10桁数字 | `\d{10}` | 🟢 後回し | 業務上扱う場合は必須化 |

**注**: 住所・氏名は正規表現での検出が困難なため、**レイヤー1ではDB登録済みの値による完全一致置換のみ**で対応する。フリー入力された住所(例: 訪問先で言及される他人の住所)は人手確認ゲートで対応。

### 4.3 拡張可能な構造

将来パターンを追加しやすいよう、**パターン定義をデータ駆動**で管理する。

```typescript
// infrastructure/ai/masking/regex-patterns.ts

export interface RegexPattern {
  category: PiiCategory;
  pattern: RegExp;
  description: string;
  enabled: boolean;
}

export const MVP_REGEX_PATTERNS: RegexPattern[] = [
  {
    category: 'phone',
    pattern: /\d{2,4}-?\d{2,4}-?\d{4}/g,
    description: '電話番号(固定・携帯)',
    enabled: true,
  },
  {
    category: 'email',
    pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g,
    description: 'メールアドレス',
    enabled: true,
  },
  {
    category: 'postal_code',
    pattern: /\d{3}-?\d{4}/g,
    description: '郵便番号',
    enabled: true,
  },
  {
    category: 'birth_date',
    pattern: /\d{4}[年/-]\d{1,2}[月/-]\d{1,2}日?/g,
    description: '生年月日(西暦)',
    enabled: true,
  },
  {
    category: 'birth_date',
    pattern: /(明治|大正|昭和|平成|令和)\d{1,2}年\d{1,2}月\d{1,2}日/g,
    description: '生年月日(和暦)',
    enabled: true,
  },
  // 将来追加するパターンはここに足すだけ
];
```

**この設計のメリット**:
- パターン追加時にロジック変更不要(データだけ追加)
- 設定 ON/OFF で運用調整可能
- テスト時にパターンごとの検出率を測定可能

### 4.4 実装層の構造

```typescript
// infrastructure/ai/masking/StructuredPiiMaskingService.ts

export class StructuredPiiMaskingService implements IPiiMaskingService {
  constructor(
    private readonly patterns: RegexPattern[] = MVP_REGEX_PATTERNS,
  ) {}

  async mask(text: string, knownPiis: KnownPiiSet): Promise<MaskingResult> {
    let masked = text;
    const placeholders: PiiPlaceholder[] = [];
    let seq = 1;

    // ステップ1: DB登録済みPIIによる完全一致置換
    // (長いものから順に置換し、部分一致による不整合を防ぐ)
    masked = this.replaceKnownPiis(masked, knownPiis, placeholders, () => seq++);

    // ステップ2: 正規表現パターンによる検出
    masked = this.replaceRegexPatterns(masked, placeholders, () => seq++);

    return MaskingResult.create({
      originalText: text,
      maskedText: masked,
      placeholders,
    });
  }

  private replaceKnownPiis(
    text: string,
    knownPiis: KnownPiiSet,
    placeholders: PiiPlaceholder[],
    nextSeq: () => number,
  ): string {
    let result = text;

    // 利用者氏名(エイリアス含む) - 長いものから順に置換
    const namePatterns = [
      knownPiis.recipientName,
      ...(knownPiis.recipientNameAliases ?? []),
    ].sort((a, b) => b.length - a.length);

    for (const pattern of namePatterns) {
      if (result.includes(pattern)) {
        const placeholder = PiiPlaceholder.create('recipient_name', pattern, nextSeq());
        result = result.replaceAll(pattern, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    // 家族氏名
    for (const family of knownPiis.familyMembers ?? []) {
      if (result.includes(family.name)) {
        const placeholder = PiiPlaceholder.create('family_name', family.name, nextSeq());
        result = result.replaceAll(family.name, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    // 既知の電話・住所・郵便番号などもここで置換
    // (DB登録済みの値による確実な置換は、正規表現より優先)

    return result;
  }

  private replaceRegexPatterns(
    text: string,
    placeholders: PiiPlaceholder[],
    nextSeq: () => number,
  ): string {
    let result = text;

    for (const pattern of this.patterns.filter(p => p.enabled)) {
      const matches = new Set<string>();
      for (const match of result.matchAll(pattern.pattern)) {
        matches.add(match[0]);
      }
      for (const match of matches) {
        // 既にプレースホルダになっていればスキップ
        if (match.startsWith('{') && match.endsWith('}')) continue;

        const placeholder = PiiPlaceholder.create(pattern.category, match, nextSeq());
        result = result.replaceAll(match, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    return result;
  }
}
```

---

## 5. ユースケース層: 2段階分割の設計

### 5.1 設計方針

「人手確認なしに Gemini に送られる経路がコード上存在しない」ことを保証するため、
ユースケースを **「マスキング準備」と「AI送信」の2段階に分割**する。

### 5.2 UseCase 1: PrepareAssessmentDraftUseCase

```typescript
// application/care-management/assessment/PrepareAssessmentDraftUseCase.ts

export interface PrepareAssessmentDraftInput {
  auth: AuthorizationContext;
  careRecipientId: string;
  voiceTranscript: string;
}

export interface PrepareAssessmentDraftOutput {
  /** プレビュー画面に表示する用のマスキング結果 */
  originalText: string;
  maskedText: string;
  placeholderSummary: Array<{
    category: PiiCategory;
    token: string;
    originalValue: string;
  }>;
  /**
   * 次のユースケースに渡すための一時IDまたはトークン
   * (マスキング結果を一時的にセッション/DB に保存して再取得する)
   */
  draftId: string;
}

export class PrepareAssessmentDraftUseCase
  implements IUseCase<PrepareAssessmentDraftInput, PrepareAssessmentDraftOutput> {

  constructor(
    private readonly careRecipientRepo: ICareRecipientRepository,
    private readonly piiMasking: IPiiMaskingService,
    private readonly draftRepo: IAssessmentDraftRepository,
  ) {}

  async execute(input: PrepareAssessmentDraftInput): Promise<PrepareAssessmentDraftOutput> {
    const tenantId = new TenantId(input.auth.tenantId);
    const recipientId = new CareRecipientId(input.careRecipientId);

    // 1. 利用者の存在 + テナント所属確認
    const recipient = await this.careRecipientRepo.findById(recipientId, tenantId);
    if (!recipient) {
      throw new UseCaseError('NOT_FOUND', '利用者が見つかりません');
    }

    // 2. KnownPiiSet を構築
    const knownPiis: KnownPiiSet = {
      recipientName: recipient.fullName,
      recipientNameAliases: this.buildNameAliases(recipient.fullName),
      familyMembers: recipient.familyMembers?.map(f => ({
        name: f.fullName,
        relation: f.relation,
      })),
      phones: [recipient.phone].filter(Boolean) as string[],
      addresses: [recipient.address].filter(Boolean) as string[],
      // ...
    };

    // 3. レイヤー1マスキング実行
    const maskingResult = await this.piiMasking.mask(input.voiceTranscript, knownPiis);

    // 4. 結果を一時保存(次のユースケースで取り出す)
    const draftId = await this.draftRepo.saveTemporary({
      tenantId,
      careRecipientId: recipientId,
      maskingResult,
      createdBy: new UserId(input.auth.userId),
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分で失効
    });

    return {
      originalText: maskingResult.originalText,
      maskedText: maskingResult.maskedText,
      placeholderSummary: maskingResult.placeholders.map(p => ({
        category: p.category,
        token: p.token,
        originalValue: p.originalValue,
      })),
      draftId,
    };
  }

  /** "田中太郎" → ["田中太郎さん", "田中さん", "太郎さん"] のようなパターン生成 */
  private buildNameAliases(fullName: string): string[] {
    // 実装は後続で詳細化
    return [];
  }
}
```

### 5.3 UseCase 2: GenerateAssessmentFromMaskedTextUseCase

```typescript
// application/care-management/assessment/GenerateAssessmentFromMaskedTextUseCase.ts

export interface GenerateAssessmentFromMaskedTextInput {
  auth: AuthorizationContext;
  /** UseCase 1 で発行された一時ID */
  draftId: string;
  /** ユーザーが画面で編集した最終マスク後テキスト */
  approvedMaskedText: string;
  /** 'initial' | 'reassessment' */
  type: AssessmentType;
  /** アセスメント実施日(訪問日) */
  conductedAt: Date;
}

export interface GenerateAssessmentFromMaskedTextOutput {
  assessmentId: string;
  issues: Array<{
    category: string;
    description: string;
    priority: string;
  }>;
}

export class GenerateAssessmentFromMaskedTextUseCase
  implements IUseCase<GenerateAssessmentFromMaskedTextInput, GenerateAssessmentFromMaskedTextOutput> {

  constructor(
    private readonly draftRepo: IAssessmentDraftRepository,
    private readonly assessmentRepo: IAssessmentRepository,
    private readonly aiSummarization: IAiSummarizationService,
    private readonly aiLogRepo: IAiGenerationLogRepository,
  ) {}

  async execute(
    input: GenerateAssessmentFromMaskedTextInput,
  ): Promise<GenerateAssessmentFromMaskedTextOutput> {
    const tenantId = new TenantId(input.auth.tenantId);

    // 1. 一時保存されたマスキング結果を取得(失効チェック含む)
    const draft = await this.draftRepo.findById(input.draftId, tenantId);
    if (!draft) {
      throw new UseCaseError(
        'NOT_FOUND',
        'マスキング結果が見つからないか有効期限が切れています。再度準備してください。',
      );
    }

    // 2. ユーザーが承認したテキストとサーバー保持のテキストを照合
    //    (ユーザーが編集していれば approvedMaskedText を採用)
    const finalMaskedText = input.approvedMaskedText;

    // 3. 念のため再検査: マスク後テキストに既知PIIおよび正規表現検出対象が残っていないか
    //    (これは多層防御の補助。基本は人手確認で担保)
    this.verifyNoPiiLeak(finalMaskedText, draft.maskingResult);

    // 4. AI 要約 → 課題・ニーズ抽出(マスク済み入力)
    const summarizationResult = await this.aiSummarization.summarizeAsAssessment({
      maskedText: finalMaskedText,
    });

    // 5. AI 生成ログを保存(マスク済み + 応答)
    //    ※ 原文 (sourceTranscript) はアセスメント集約が単一ソースとして保持するため、
    //      ai_generation_logs 側では original_text は保存せず、related_entity_id で参照する。
    //      (§6.2 / §6.3 の single-source 方針を参照)
    // 6. アセスメント集約を生成(新スキーマ: placeholderMap + maskedSummary + sourceTranscript)
    const placeholderMap = PlaceholderMapSnapshot.create(
      draft.maskingResult.placeholders.map(p => ({
        token: p.token,
        originalValue: p.originalValue,
        category: p.category,
      })),
    );

    const issues = summarizationResult.issues.map((issue, idx) =>
      AssessmentIssue.create({
        category: issue.category,
        description: issue.description, // プレースホルダ入りのまま
        priority: issue.priority,
        sequenceNo: idx + 1,
      }),
    );

    const assessment = Assessment.create({
      tenantId,
      careRecipientId: draft.careRecipientId,
      type: input.type,
      issues,
      sourceTranscript: draft.maskingResult.originalText,
      maskedSummary: finalMaskedText,
      placeholderMap,
      conductedAt: input.conductedAt,
      createdBy: new UserId(input.auth.userId),
    });

    // 7. 永続化(集約を先に保存してから監査ログを related_entity_id で紐付け)
    await this.assessmentRepo.save(assessment);

    await this.aiLogRepo.save({
      tenantId,
      kind: 'assessment_summarization',
      maskedText: finalMaskedText,
      placeholderMap: draft.maskingResult.placeholders.map(p => ({
        token: p.token,
        category: p.category,
        // originalValue は保存しない(集約側に閉じ込める)
      })),
      aiResponse: summarizationResult.rawResponse,
      relatedEntityType: 'assessment',
      relatedEntityId: assessment.id.value,
      createdBy: new UserId(input.auth.userId),
    });

    // 8. 一時ドラフトを削除
    await this.draftRepo.delete(input.draftId);

    return {
      assessmentId: assessment.id.value,
      issues: assessment.issues.map(i => ({
        category: i.category,
        description: i.description, // マスク済みのまま返す(画面側でアンマスク)
        priority: i.priority,
      })),
    };
  }

  /**
   * マスク後テキストに PII の原値、または正規表現で検出されうる新規 PII
   * (人手編集で紛れ込んだ電話番号等) が残っていないかを再検査する多層防御。
   */
  private verifyNoPiiLeak(text: string, original: MaskingResult): void {
    // 既知 PII の再出現チェック
    for (const placeholder of original.placeholders) {
      if (text.includes(placeholder.originalValue)) {
        throw new UseCaseError(
          'INCONSISTENT_DATA',
          `マスク漏れが検出されました: ${placeholder.category}`,
        );
      }
    }
    // 正規表現パターンの再検査(既存のプレースホルダトークン自体はマッチさせない)
    for (const pattern of MVP_REGEX_PATTERNS.filter(p => p.enabled)) {
      const matches = [...text.matchAll(pattern.pattern)];
      for (const m of matches) {
        const value = m[0];
        if (value.startsWith('{') && value.endsWith('}')) continue; // プレースホルダ
        throw new UseCaseError(
          'INCONSISTENT_DATA',
          `人手編集後のマスク漏れが検出されました(${pattern.category}): ${value}`,
        );
      }
    }
  }
}
```

### 5.4 設計判断のポイント

| 判断 | 理由 |
|------|------|
| 一時テーブル `assessment_drafts` に保存 | UseCase 間の状態共有。セッション保存より安全(サーバー側で完結) |
| 30分の TTL を設定 | 放置されたドラフトが残り続けてDB肥大化するのを防ぐ |
| `verifyNoKnownPiiLeak` で再検査 | 人手編集ミスで原文PIIが復活していないかチェック(多層防御) |
| `approvedMaskedText` を引数で受け取る | ユーザーが編集した最終形を確実に保存 |

---

## 6. データベース設計への影響

### 6.1 新規テーブル: assessment_drafts(一時保存)

```sql
CREATE TABLE assessment_drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),
  care_recipient_id   UUID NOT NULL REFERENCES care_recipients(id),

  original_text       TEXT NOT NULL,        -- マスキング前の原文
  masked_text         TEXT NOT NULL,        -- マスキング後テキスト
  placeholder_map     JSONB NOT NULL,       -- placeholder → originalValue の対応表

  created_by          UUID NOT NULL REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL  -- TTL (30分後など)
);

-- TTL 失効ドラフトを定期削除する pg_cron ジョブを別途設定
CREATE INDEX idx_assessment_drafts_tenant ON assessment_drafts(tenant_id);
CREATE INDEX idx_assessment_drafts_expires ON assessment_drafts(expires_at);

ALTER TABLE assessment_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessment_drafts_tenant_isolation ON assessment_drafts
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
```

### 6.2 既存テーブル拡張: ai_generation_logs

設計ドキュメントの `ai_generation_logs` を以下のように拡張する。

```sql
CREATE TABLE ai_generation_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id),

  -- 用途識別
  kind                VARCHAR(50) NOT NULL,  -- 'assessment_summarization', 'care_plan_draft', 'email_reply_draft', etc.

  -- マスキング関連
  -- original_text は NULLABLE。集約(assessments.source_transcript 等)が単一ソースで保持する
  -- ケースでは NULL とし、related_entity_id で参照する(単一ソース原則)。
  -- 集約を持たないケース(kind='email_reply_draft' など)では NOT NULL 運用とする。
  original_text       TEXT,                  -- 原文(単一ソースが無い場合のみ保存)
  masked_text         TEXT NOT NULL,         -- 実際にAIに送ったテキスト
  placeholder_map     JSONB NOT NULL,        -- マスキングメタデータ(originalValue は保存しない場合あり)
  masking_stats       JSONB,                 -- 統計情報(検出件数など)

  -- AI応答
  ai_response         JSONB NOT NULL,        -- 生のAPI応答
  ai_model            VARCHAR(50),           -- 'gemini-1.5-flash' など
  prompt_template_id  VARCHAR(100),          -- プロンプトテンプレートのバージョン管理

  -- 関連エンティティ(任意)
  related_entity_type VARCHAR(50),           -- 'assessment', 'care_plan' など
  related_entity_id   UUID,

  -- メタ
  created_by          UUID NOT NULL REFERENCES app_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- レイテンシ・コスト記録(運用監視用)
  request_tokens      INTEGER,
  response_tokens     INTEGER,
  latency_ms          INTEGER
);

CREATE INDEX idx_ai_logs_tenant_kind ON ai_generation_logs(tenant_id, kind);
CREATE INDEX idx_ai_logs_related_entity ON ai_generation_logs(related_entity_type, related_entity_id);
CREATE INDEX idx_ai_logs_created_at ON ai_generation_logs(created_at DESC);

ALTER TABLE ai_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_logs_tenant_isolation ON ai_generation_logs
  FOR ALL
  USING (
    tenant_id = (SELECT tenant_id FROM app_users WHERE id = auth.uid())
  );
```

### 6.3 設計判断

| 判断 | 理由 |
|------|------|
| `assessment_drafts` を別テーブルに | 一時データなので本番テーブルと混ぜない。失効処理も独立 |
| `ai_generation_logs.original_text` は NULLABLE | 集約(`assessments.source_transcript`)が単一ソースを保持する場合は重複保存を避け、`related_entity_id` で参照する。PII 平文の露出箇所を最小化 |
| 集約を持たないユースケース(メール返信等) | `related_entity_id` が無いため `original_text` を必須保存(監査要件) |
| `placeholder_map` を JSONB で保存 | 構造が可変、検索要件は薄いため |
| `original_text` は将来的に暗号化推奨 | MVP では平文だが、Supabase の `pgcrypto` 拡張で対応可能 |
| TTL 失効は `pg_cron` で別ジョブ | アプリ層に時刻管理を持ち込まない |

---

## 7. アンマスキングの設計

### 7.1 方針

| 場所 | アンマスクの有無 |
|------|----------------|
| DB保存 | ❌ アンマスクしない(マスク済みのまま保存) |
| API応答(クライアントへ) | ✅ クライアントに渡す前にアンマスク |
| AI再送信時 | ❌ アンマスクしない(再度マスク済みを送信) |
| エクスポート(PDF/Word) | ✅ アンマスク後を出力 |

### 7.2 実装パターン

```typescript
// application/care-management/assessment/GetAssessmentForViewUseCase.ts

export class GetAssessmentForViewUseCase {
  async execute(input: GetAssessmentInput): Promise<GetAssessmentOutput> {
    const assessment = await this.assessmentRepo.findById(/* ... */);
    if (!assessment) throw new UseCaseError('NOT_FOUND', 'アセスメントが見つかりません');

    // アンマスク能力は集約自身が持つ(PlaceholderMapSnapshot 経由)。
    // 表示用ユースケースはその能力を呼び出すだけで、アンマスク辞書を直接触らない。
    return {
      id: assessment.id.value,
      summary: assessment.getUnmaskedSummary(),
      issues: assessment.issues.map(i => ({
        id: i.id.value,
        category: i.category,
        description: assessment.getUnmaskedIssueDescription(i.id),
        priority: i.priority,
      })),
    };
  }
}
```

**重要**: アンマスクは「表示用ユースケース」または「プレゼンテーション層」から集約のメソッド (`getUnmaskedSummary` / `getUnmaskedIssueDescription`) 経由で呼び出す。`PlaceholderMapSnapshot` は集約に閉じ込められ、外部に露出しない。ドメイン層・リポジトリ層が扱うのは常にマスク済みのテキストのみ。

---

## 8. テスト方針

### 8.1 単体テスト(必須)

```typescript
// __tests__/StructuredPiiMaskingService.test.ts

describe('StructuredPiiMaskingService', () => {
  it('利用者氏名を確実に置換する', async () => {
    const service = new StructuredPiiMaskingService();
    const result = await service.mask(
      '田中太郎さんは膝が痛いと話していた',
      { recipientName: '田中太郎', recipientNameAliases: ['田中太郎さん'] },
    );

    expect(result.maskedText).not.toContain('田中太郎');
    expect(result.maskedText).toContain('{RECIPIENT_NAME_001}');
  });

  it('電話番号を検出する', async () => {
    const result = await service.mask(
      '090-1234-5678 に連絡してください',
      { recipientName: 'ダミー' },
    );
    expect(result.maskedText).not.toContain('090-1234-5678');
  });

  it('長い名前から短い名前の順に置換する(部分一致防止)', async () => {
    const result = await service.mask(
      '田中太郎さんと田中さんは別人です',
      {
        recipientName: '田中太郎',
        recipientNameAliases: ['田中太郎さん', '田中さん'],
      },
    );
    // 田中太郎さんが先に置換されるべき
    expect(result.placeholders.find(p => p.originalValue === '田中太郎さん')).toBeDefined();
  });

  it('unmask で元の値に戻せる', async () => {
    const result = await service.mask(
      '田中太郎さん',
      { recipientName: '田中太郎' },
    );
    const aiResponse = `${result.placeholders[0].token} の状態は良好`;
    expect(result.unmask(aiResponse)).toBe('田中太郎 の状態は良好');
  });
});
```

### 8.2 統合テスト

- `PrepareAssessmentDraftUseCase` → 一時保存まで通しで実行
- `GenerateAssessmentFromMaskedTextUseCase` → モックの AI で応答シミュレート
- TTL 失効後のドラフト取得が失敗することを確認

### 8.3 セキュリティテスト(必須)

| テスト | 確認事項 |
|--------|---------|
| 既知PIIリーク検査 | 利用者氏名がマスク後テキストに残らないこと |
| プレースホルダ衝突 | プレースホルダ自体がテキストに混入していた場合の処理 |
| 編集ミス検証 | ユーザーがマスク後テキストを編集して原文PIIを書き戻した場合に検出できること |
| TTL失効 | 期限切れドラフトでAI送信ができないこと |

---

## 9. MVP優先度マトリクス

### 9.1 ドメイン層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `PiiPlaceholder` / `MaskingResult` 値オブジェクト |
| 🔴 必須 | `IPiiMaskingService` インターフェース |
| 🔴 必須 | `KnownPiiSet` の型定義 |
| 🟡 推奨 | `MaskingStatistics` (監査・運用観点) |
| 🟢 後回し | LLMマスキング向けの追加抽象化 |

### 9.2 実装層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | `StructuredPiiMaskingService` (DB値置換 + 正規表現) |
| 🔴 必須 | MVP正規表現パターン5種(電話・メール・郵便番号・西暦/和暦生年月日) |
| 🟡 推奨 | パターン定義のデータ駆動化(`MVP_REGEX_PATTERNS`) |
| 🟡 推奨 | `verifyNoKnownPiiLeak` 多層防御チェック |
| 🟢 後回し | 暗号化保存(pgcrypto) |

### 9.3 ユースケース層

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | 2段階分割(`Prepare~` と `Generate~`) |
| 🔴 必須 | `assessment_drafts` 一時テーブル |
| 🔴 必須 | TTL失効処理(pg_cron) |
| 🟡 推奨 | `ai_generation_logs` への詳細記録 |
| 🟢 後回し | アクセスログ・監査UI |

### 9.4 UI/UX層(本ドキュメントの範囲外、参考)

| 優先度 | 項目 |
|--------|------|
| 🔴 必須 | 原文 / マスク後の差分表示プレビュー画面 |
| 🔴 必須 | 「この内容で送信」明示的ボタン |
| 🟡 推奨 | マスク追加・解除のインライン編集 |
| 🟢 後回し | マスキング統計のダッシュボード |

---

## 10. 未決定事項・今後の論点

| 論点 | 内容 |
|------|------|
| 一時データの暗号化 | `assessment_drafts.original_text` を pgcrypto で暗号化するかどうか |
| ナレッジRAGでのマスキング扱い | 解消済み → `knowledge-context-design.md` §7 参照 |
| メール返信機能でのマスキング | 解消済み → `care-manager-ai-design.md` §7.6 で `piiMasking.mask` 適用に確定 |
| プレースホルダ命名の業務適合性 | `{RECIPIENT_NAME_001}` がGeminiにとって扱いやすい形式か実測必要 |
| 同姓同名の区別 | `田中太郎さん` が複数いた場合の区別(MVPでは想定外、将来対応) |
| 文字起こし精度との相互作用 | Web Speech API の誤認識でPIIが認識されない場合の補完戦略 |
| LLMマスキング(レイヤー2)の追加判断 | MVP運用後、見逃しの実態を見て追加判断 |

---

## 付録A: 用語集

| 用語 | 定義 |
|------|------|
| PII | Personally Identifiable Information(個人識別情報) |
| プレースホルダ | PIIを置換した安全なトークン(`{RECIPIENT_NAME_001}` など) |
| マスキング | PIIをプレースホルダに置換すること |
| アンマスキング | プレースホルダを元のPIIに戻すこと |
| レイヤー1 | 構造化データ(DB登録済みPII + 正規表現)による確実な置換 |
| レイヤー2 | LLMによる固有名詞・医療情報の自動マスキング(MVPでは見送り) |
| レイヤー3 | 人手確認ゲート(ユーザーが画面でマスク結果を承認) |
| KnownPiiSet | DB等から取得した「既知のPII」のセット |
| MaskingResult | マスキング処理結果を表す値オブジェクト |

---

**ドキュメントバージョン**: 0.2(実装前レビュー反映版)
**最終更新**: 2026-04-23
**0.2 の主な変更点**:
- §5.3 `GenerateAssessmentFromMaskedTextUseCase` のコード例を `Assessment.create` 新スキーマ(`placeholderMap`/`sourceTranscript`/`maskedSummary`/`type`/`conductedAt`)に同期
- §5.3 `verifyNoKnownPiiLeak` を `verifyNoPiiLeak` に改名し、正規表現パターンの再検査を追加
- §7.2 `GetAssessmentForViewUseCase` のアンマスクを集約メソッド (`getUnmaskedSummary`/`getUnmaskedIssueDescription`) 経由に変更
- §6.2 `ai_generation_logs.original_text` を NULLABLE 化し、集約側を単一ソースとする方針に
- §10 メール返信マスキング・ナレッジRAG 項目を他ドキュメントへのクロスリンクで解消
