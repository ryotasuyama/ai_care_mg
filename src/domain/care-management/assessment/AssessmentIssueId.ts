export class AssessmentIssueId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('AssessmentIssueId cannot be empty');
    }
  }

  static generate(): AssessmentIssueId {
    return new AssessmentIssueId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: AssessmentIssueId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
