import { describe, it, expect } from 'vitest';
import { UserId } from './UserId';

describe('UserId', () => {
  it('holds and returns value', () => {
    const id = new UserId('user-1');
    expect(id.value).toBe('user-1');
  });

  it('equals another with same value', () => {
    expect(new UserId('u').equals(new UserId('u'))).toBe(true);
    expect(new UserId('u').equals(new UserId('v'))).toBe(false);
  });

  it('throws on empty string', () => {
    expect(() => new UserId('')).toThrow();
  });
});
