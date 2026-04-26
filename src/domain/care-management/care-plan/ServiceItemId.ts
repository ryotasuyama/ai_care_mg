export class ServiceItemId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('ServiceItemId cannot be empty');
    }
  }
  static generate(): ServiceItemId {
    return new ServiceItemId(crypto.randomUUID());
  }
  get value(): string {
    return this._value;
  }
  equals(other: ServiceItemId): boolean {
    return this._value === other._value;
  }
}
