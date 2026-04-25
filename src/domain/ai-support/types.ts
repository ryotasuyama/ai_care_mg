export type IssueCategory =
  | 'health'
  | 'adl'
  | 'iadl'
  | 'cognitive'
  | 'social'
  | 'family'
  | 'other';

export type IssuePriority = 'high' | 'medium' | 'low';

export class EmbeddingVector {
  private constructor(
    public readonly values: ReadonlyArray<number>,
  ) {}

  static create(values: number[]): EmbeddingVector {
    return new EmbeddingVector(values);
  }

  get dimensions(): number {
    return this.values.length;
  }
}
