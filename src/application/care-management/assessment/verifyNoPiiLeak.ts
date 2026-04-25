import { MVP_REGEX_PATTERNS } from '@/infrastructure/ai/masking/regex-patterns';
import type { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';
import { UseCaseError } from '@/application/shared/UseCaseError';

/**
 * マスク後テキストに PII の原値、または正規表現で検出されうる新規 PII
 * (人手編集で紛れ込んだ電話番号等) が残っていないかを再検査する多層防御。
 *
 * 漏れを検知した場合は UseCaseError('INCONSISTENT_DATA') を throw する。
 */
export function verifyNoPiiLeak(text: string, original: MaskingResult): void {
  // 1. 既知 PII の原値が再出現していないか
  for (const placeholder of original.placeholders) {
    if (text.includes(placeholder.originalValue)) {
      throw new UseCaseError(
        'INCONSISTENT_DATA',
        `マスク漏れが検出されました（${placeholder.category}）: ${placeholder.originalValue}`,
      );
    }
  }

  // 2. 正規表現パターンの再検査 (プレースホルダトークンは除外)
  for (const pattern of MVP_REGEX_PATTERNS.filter((p) => p.enabled)) {
    const re = new RegExp(pattern.pattern.source, pattern.pattern.flags);
    for (const m of text.matchAll(re)) {
      const value = m[0];
      if (value.startsWith('{') && value.endsWith('}')) continue;
      throw new UseCaseError(
        'INCONSISTENT_DATA',
        `人手編集後のマスク漏れが検出されました（${pattern.category}）: ${value}`,
      );
    }
  }
}
