import { describe, it, expect } from 'vitest';
import { PlaceholderMapSnapshot } from './PlaceholderMapSnapshot';

describe('PlaceholderMapSnapshot', () => {
  it('unmask replaces all placeholders with original values', () => {
    const map = PlaceholderMapSnapshot.create([
      { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
      { token: '{PHONE_002}', originalValue: '090-1234-5678', category: 'phone' },
    ]);
    const text = '{RECIPIENT_NAME_001} さんに {PHONE_002} で連絡';
    expect(map.unmask(text)).toBe('田中太郎 さんに 090-1234-5678 で連絡');
  });

  it('returns text unchanged when no placeholders match', () => {
    const map = PlaceholderMapSnapshot.create([
      { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
    ]);
    expect(map.unmask('変更なしのテキスト')).toBe('変更なしのテキスト');
  });

  it('count returns number of entries', () => {
    const map = PlaceholderMapSnapshot.create([
      { token: '{A_001}', originalValue: 'a', category: 'recipient_name' },
      { token: '{B_002}', originalValue: 'b', category: 'phone' },
    ]);
    expect(map.count).toBe(2);
  });

  it('toJSON exposes entries for persistence', () => {
    const entries = [
      { token: '{X_001}', originalValue: 'x', category: 'recipient_name' as const },
    ];
    const map = PlaceholderMapSnapshot.create(entries);
    expect(map.toJSON()).toEqual(entries);
  });

  it('replaceAll handles repeated tokens', () => {
    const map = PlaceholderMapSnapshot.create([
      { token: '{RECIPIENT_NAME_001}', originalValue: '太郎', category: 'recipient_name' },
    ]);
    expect(map.unmask('{RECIPIENT_NAME_001} と {RECIPIENT_NAME_001}')).toBe('太郎 と 太郎');
  });
});
