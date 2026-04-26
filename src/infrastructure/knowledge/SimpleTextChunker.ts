import type { ITextChunker, ChunkSpec } from './ITextChunker';
import type { ExtractedPage } from './ITextExtractor';

const DEFAULT_MAX_CHARS = 800;
const DEFAULT_OVERLAP_CHARS = 100;

/**
 * 固定文字数 + オーバーラップによる単純なチャンク分割器。
 * 設計参照: docs/knowledge-context-design.md §3
 */
export class SimpleTextChunker implements ITextChunker {
  split(
    pages: ExtractedPage[],
    options?: { maxChars?: number; overlapChars?: number },
  ): ChunkSpec[] {
    const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;
    const overlap = options?.overlapChars ?? DEFAULT_OVERLAP_CHARS;
    if (maxChars <= overlap) {
      throw new Error('maxChars must be greater than overlapChars');
    }

    const result: ChunkSpec[] = [];
    for (const page of pages) {
      const trimmed = page.text.replace(/\s+\n/g, '\n').trim();
      if (trimmed.length === 0) continue;

      let cursor = 0;
      while (cursor < trimmed.length) {
        const end = Math.min(cursor + maxChars, trimmed.length);
        const slice = trimmed.slice(cursor, end).trim();
        if (slice.length > 0) {
          result.push({ text: slice, pageNumber: page.pageNumber });
        }
        if (end >= trimmed.length) break;
        cursor = end - overlap;
        if (cursor < 0) cursor = 0;
      }
    }
    return result;
  }
}
