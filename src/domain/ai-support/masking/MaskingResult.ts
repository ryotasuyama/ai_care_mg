import type { PiiCategory, PiiPlaceholder } from './PiiPlaceholder';

export interface MaskingStatistics {
  totalPlaceholders: number;
  byCategory: Partial<Record<PiiCategory, number>>;
}

export class MaskingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MaskingError';
  }
}

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

  unmask(textWithPlaceholders: string): string {
    let result = textWithPlaceholders;
    for (const p of this.placeholders) {
      result = result.replaceAll(p.token, p.originalValue);
    }
    return result;
  }

  get statistics(): MaskingStatistics {
    return {
      totalPlaceholders: this.placeholders.length,
      byCategory: this.placeholders.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      }, {} as Partial<Record<PiiCategory, number>>),
    };
  }
}
