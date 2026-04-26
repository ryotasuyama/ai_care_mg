import type { ITextExtractor, ExtractedPage } from './ITextExtractor';
import type { SourceFileType } from '@/domain/knowledge/document/types';

/**
 * MVP 版テキスト抽出器。
 * - txt: UTF-8 として直接読み込む。
 * - pdf / docx: 専用ライブラリ (pdf-parse / mammoth) が未導入のため失敗を投げる。
 *   運用で使うようになったら、それぞれの実装を別ファイルで差し替える。
 */
export class DefaultTextExtractor implements ITextExtractor {
  async extract(buffer: Buffer, type: SourceFileType): Promise<ExtractedPage[]> {
    if (type === 'txt') {
      const text = buffer.toString('utf-8').trim();
      if (text.length === 0) {
        throw new Error('テキストファイルが空です');
      }
      return [{ pageNumber: null, text }];
    }

    if (type === 'pdf') {
      throw new Error(
        'PDF テキスト抽出はサポートライブラリ未導入のため未実装です。pdf-parse / unpdf を導入してください。',
      );
    }

    if (type === 'docx') {
      throw new Error(
        'DOCX テキスト抽出はサポートライブラリ未導入のため未実装です。mammoth を導入してください。',
      );
    }

    throw new Error(`Unsupported source file type: ${type}`);
  }
}
