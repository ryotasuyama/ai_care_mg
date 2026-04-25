import type { IPiiMaskingService, KnownPiiSet } from '@/domain/ai-support/masking/IPiiMaskingService';
import { PiiPlaceholder } from '@/domain/ai-support/masking/PiiPlaceholder';
import { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';
import { MVP_REGEX_PATTERNS, type RegexPattern } from './regex-patterns';

export class StructuredPiiMaskingService implements IPiiMaskingService {
  constructor(
    private readonly patterns: RegexPattern[] = MVP_REGEX_PATTERNS,
  ) {}

  async mask(text: string, knownPiis: KnownPiiSet): Promise<MaskingResult> {
    let masked = text;
    const placeholders: PiiPlaceholder[] = [];
    let seq = 1;

    masked = this.replaceKnownPiis(masked, knownPiis, placeholders, () => seq++);
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

    // 利用者氏名（長いものから順に置換して部分一致を防ぐ）
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

    // 既知電話番号
    for (const phone of knownPiis.phones ?? []) {
      if (result.includes(phone)) {
        const placeholder = PiiPlaceholder.create('phone', phone, nextSeq());
        result = result.replaceAll(phone, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    // 既知住所
    for (const address of knownPiis.addresses ?? []) {
      if (result.includes(address)) {
        const placeholder = PiiPlaceholder.create('address', address, nextSeq());
        result = result.replaceAll(address, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    // 既知郵便番号
    for (const postalCode of knownPiis.postalCodes ?? []) {
      if (result.includes(postalCode)) {
        const placeholder = PiiPlaceholder.create('postal_code', postalCode, nextSeq());
        result = result.replaceAll(postalCode, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    // 既知生年月日
    if (knownPiis.birthDate && result.includes(knownPiis.birthDate)) {
      const placeholder = PiiPlaceholder.create('birth_date', knownPiis.birthDate, nextSeq());
      result = result.replaceAll(knownPiis.birthDate, placeholder.token);
      placeholders.push(placeholder);
    }

    return result;
  }

  private replaceRegexPatterns(
    text: string,
    placeholders: PiiPlaceholder[],
    nextSeq: () => number,
  ): string {
    let result = text;

    for (const regexPattern of this.patterns.filter((p) => p.enabled)) {
      // RegExp の lastIndex をリセットするため毎回新規インスタンスを使う
      const re = new RegExp(regexPattern.pattern.source, regexPattern.pattern.flags);
      const matches = new Set<string>();

      for (const match of result.matchAll(re)) {
        matches.add(match[0]);
      }

      for (const match of matches) {
        // 既にプレースホルダになっている値はスキップ
        if (match.startsWith('{') && match.endsWith('}')) continue;

        const placeholder = PiiPlaceholder.create(regexPattern.category, match, nextSeq());
        result = result.replaceAll(match, placeholder.token);
        placeholders.push(placeholder);
      }
    }

    return result;
  }
}
