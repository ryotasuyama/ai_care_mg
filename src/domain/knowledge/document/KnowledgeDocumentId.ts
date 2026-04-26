export class KnowledgeDocumentId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('KnowledgeDocumentId cannot be empty');
    }
  }

  static generate(): KnowledgeDocumentId {
    return new KnowledgeDocumentId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: KnowledgeDocumentId): boolean {
    return this._value === other._value;
  }
}
