import { describe, it, expect } from 'vitest';
import { verifyNoPiiLeak } from './verifyNoPiiLeak';
import { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';
import { PiiPlaceholder } from '@/domain/ai-support/masking/PiiPlaceholder';
import { UseCaseError } from '@/application/shared/UseCaseError';

function makeResult(originals: Array<{ category: 'recipient_name' | 'phone'; value: string }>) {
  const placeholders = originals.map((o, i) =>
    PiiPlaceholder.create(o.category, o.value, i + 1),
  );
  return MaskingResult.create({
    originalText: '原文',
    maskedText: 'マスク済み',
    placeholders,
  });
}

describe('verifyNoPiiLeak', () => {
  it('passes when masked text contains no PII', () => {
    const r = makeResult([{ category: 'recipient_name', value: '田中太郎' }]);
    expect(() => verifyNoPiiLeak('{RECIPIENT_NAME_001} さんは元気', r)).not.toThrow();
  });

  it('detects re-introduced known PII', () => {
    const r = makeResult([{ category: 'recipient_name', value: '田中太郎' }]);
    expect(() => verifyNoPiiLeak('田中太郎 さんは元気', r)).toThrow(UseCaseError);
  });

  it('detects new phone numbers added by hand', () => {
    const r = makeResult([{ category: 'recipient_name', value: '田中太郎' }]);
    expect(() => verifyNoPiiLeak('連絡先は 090-1111-2222', r)).toThrow(UseCaseError);
  });

  it('does not flag placeholder tokens themselves', () => {
    const r = makeResult([{ category: 'phone', value: '090-1234-5678' }]);
    expect(() => verifyNoPiiLeak('{PHONE_001} に連絡', r)).not.toThrow();
  });
});
