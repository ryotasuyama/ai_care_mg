export class TenantId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('TenantId cannot be empty');
    }
  }

  get value(): string {
    return this._value;
  }

  equals(other: TenantId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
