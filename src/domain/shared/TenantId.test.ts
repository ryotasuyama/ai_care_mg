import { describe, it, expect } from 'vitest';
import { TenantId } from './TenantId';

describe('TenantId', () => {
  it('holds and returns value', () => {
    const id = new TenantId('abc-123');
    expect(id.value).toBe('abc-123');
    expect(id.toString()).toBe('abc-123');
  });

  it('equals another with same value', () => {
    expect(new TenantId('x').equals(new TenantId('x'))).toBe(true);
    expect(new TenantId('x').equals(new TenantId('y'))).toBe(false);
  });

  it('throws on empty string', () => {
    expect(() => new TenantId('')).toThrow();
  });
});
