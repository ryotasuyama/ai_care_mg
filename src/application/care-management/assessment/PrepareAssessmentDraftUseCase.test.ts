import { describe, it, expect } from 'vitest';
import { buildNameAliases } from './PrepareAssessmentDraftUseCase';

describe('buildNameAliases', () => {
  it('produces honorific suffix variants for full name', () => {
    const aliases = buildNameAliases('田中太郎');
    expect(aliases).toContain('田中太郎さん');
    expect(aliases).toContain('田中太郎様');
  });

  it('splits by whitespace into surname/given variants', () => {
    const aliases = buildNameAliases('田中 太郎');
    expect(aliases).toContain('田中さん');
    expect(aliases).toContain('太郎さん');
  });

  it('falls back to first-two/rest split when no whitespace', () => {
    const aliases = buildNameAliases('田中太郎');
    expect(aliases).toContain('田中さん');
    expect(aliases).toContain('太郎さん');
  });

  it('returns empty for empty input', () => {
    expect(buildNameAliases('')).toEqual([]);
    expect(buildNameAliases('   ')).toEqual([]);
  });
});
