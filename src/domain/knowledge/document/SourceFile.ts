import { KnowledgeValidationError } from './KnowledgeValidationError';
import { SOURCE_FILE_TYPE_VALUES, type SourceFileType } from './types';

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

export class SourceFile {
  private constructor(
    public readonly url: string,
    public readonly storagePath: string,
    public readonly type: SourceFileType,
    public readonly sizeBytes: number,
  ) {}

  static create(params: {
    url: string;
    storagePath: string;
    type: SourceFileType;
    sizeBytes: number;
  }): SourceFile {
    if (params.sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new KnowledgeValidationError(
        `ファイルサイズ上限(20MB)を超えています: ${params.sizeBytes} bytes`,
      );
    }
    if (params.sizeBytes <= 0) {
      throw new KnowledgeValidationError('ファイルサイズが不正です');
    }
    if (!(SOURCE_FILE_TYPE_VALUES as readonly string[]).includes(params.type)) {
      throw new KnowledgeValidationError(`サポートされていないファイル種別: ${params.type}`);
    }
    return new SourceFile(params.url, params.storagePath, params.type, params.sizeBytes);
  }

  static reconstruct(params: {
    url: string;
    storagePath: string;
    type: SourceFileType;
    sizeBytes: number;
  }): SourceFile {
    return new SourceFile(params.url, params.storagePath, params.type, params.sizeBytes);
  }
}
