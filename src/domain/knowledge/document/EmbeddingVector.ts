import { KnowledgeValidationError } from './KnowledgeValidationError';

export const EMBEDDING_DIMENSIONS = 768;

export class EmbeddingVector {
  private constructor(public readonly values: ReadonlyArray<number>) {}

  static create(values: number[]): EmbeddingVector {
    if (values.length !== EMBEDDING_DIMENSIONS) {
      throw new KnowledgeValidationError(
        `埋め込みベクトルは ${EMBEDDING_DIMENSIONS} 次元である必要があります。実際: ${values.length}`,
      );
    }
    return new EmbeddingVector([...values]);
  }

  /** リポジトリ復元用 (バリデーションなし) */
  static reconstruct(values: number[]): EmbeddingVector {
    return new EmbeddingVector([...values]);
  }

  toArray(): number[] {
    return [...this.values];
  }

  /** pgvector 形式 ('[0.1,0.2,...]') への文字列化 */
  toPgVectorLiteral(): string {
    return `[${this.values.join(',')}]`;
  }
}
