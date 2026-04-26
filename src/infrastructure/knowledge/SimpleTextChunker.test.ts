import { describe, it, expect } from 'vitest';
import { SimpleTextChunker } from './SimpleTextChunker';

describe('SimpleTextChunker.split', () => {
  it('returns 1 chunk for short text', () => {
    const c = new SimpleTextChunker();
    const chunks = c.split([{ pageNumber: null, text: 'short text' }]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toBe('short text');
  });

  it('splits long text into overlapping chunks', () => {
    const text = 'a'.repeat(2000);
    const c = new SimpleTextChunker();
    const chunks = c.split([{ pageNumber: 1, text }], { maxChars: 800, overlapChars: 100 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.text.length).toBe(800);
    expect(chunks[0]!.pageNumber).toBe(1);
  });

  it('preserves page numbers per page', () => {
    const c = new SimpleTextChunker();
    const chunks = c.split([
      { pageNumber: 1, text: 'page1' },
      { pageNumber: 2, text: 'page2' },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.pageNumber).toBe(1);
    expect(chunks[1]!.pageNumber).toBe(2);
  });

  it('skips empty pages', () => {
    const c = new SimpleTextChunker();
    const chunks = c.split([
      { pageNumber: 1, text: '   ' },
      { pageNumber: 2, text: 'real' },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.pageNumber).toBe(2);
  });

  it('rejects maxChars <= overlapChars', () => {
    const c = new SimpleTextChunker();
    expect(() => c.split([{ pageNumber: null, text: 'x' }], { maxChars: 50, overlapChars: 50 })).toThrow();
  });
});
