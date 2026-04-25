export class UserId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('UserId cannot be empty');
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: UserId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
