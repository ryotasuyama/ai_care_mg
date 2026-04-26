export class LongTermGoalId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('LongTermGoalId cannot be empty');
    }
  }
  static generate(): LongTermGoalId {
    return new LongTermGoalId(crypto.randomUUID());
  }
  get value(): string {
    return this._value;
  }
  equals(other: LongTermGoalId): boolean {
    return this._value === other._value;
  }
}
