import type { PiiCategory } from '@/domain/ai-support/masking/PiiPlaceholder';

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
    description: '電話番号（固定・携帯）',
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
    description: '生年月日（西暦）',
    enabled: true,
  },
  {
    category: 'birth_date',
    pattern: /(明治|大正|昭和|平成|令和)\d{1,2}年\d{1,2}月\d{1,2}日/g,
    description: '生年月日（和暦）',
    enabled: true,
  },
];
