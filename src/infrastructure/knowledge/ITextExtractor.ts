import type { SourceFileType } from '@/domain/knowledge/document/types';

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
}

export interface ITextExtractor {
  extract(buffer: Buffer, type: SourceFileType): Promise<ExtractedPage[]>;
}
