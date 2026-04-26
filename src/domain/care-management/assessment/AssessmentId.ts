export class AssessmentId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('AssessmentId cannot be empty');
    }
  }

  static generate(): AssessmentId {
    return new AssessmentId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: AssessmentId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
