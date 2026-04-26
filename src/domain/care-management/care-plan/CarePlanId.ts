export class CarePlanId {
  constructor(private readonly _value: string) {
    if (!_value || _value.trim() === '') {
      throw new Error('CarePlanId cannot be empty');
    }
  }

  static generate(): CarePlanId {
    return new CarePlanId(crypto.randomUUID());
  }

  get value(): string {
    return this._value;
  }

  equals(other: CarePlanId): boolean {
    return this._value === other._value;
  }
}
