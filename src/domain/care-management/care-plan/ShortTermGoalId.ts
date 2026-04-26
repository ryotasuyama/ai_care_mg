export class ShortTermGoalId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('ShortTermGoalId cannot be empty');
    }
  }
  static generate(): ShortTermGoalId {
    return new ShortTermGoalId(crypto.randomUUID());
  }
  get value(): string {
    return this._value;
  }
  equals(other: ShortTermGoalId): boolean {
    return this._value === other._value;
  }
}
