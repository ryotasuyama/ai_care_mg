export class KnowledgeChunkId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('KnowledgeChunkId cannot be empty');
    }
  }

  static generate(): KnowledgeChunkId {
    return new KnowledgeChunkId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: KnowledgeChunkId): boolean {
    return this._value === other._value;
  }
}
