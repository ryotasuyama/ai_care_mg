import type { ExtractedPage } from './ITextExtractor';

export interface ChunkSpec {
  text: string;
  pageNumber: number | null;
}

export interface ITextChunker {
  split(pages: ExtractedPage[], options?: { maxChars?: number; overlapChars?: number }): ChunkSpec[];
}
