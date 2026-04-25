import { ValidationError } from '@/domain/shared/errors/ValidationError';

export const CARE_LEVEL_VALUES = [
  'support_1',
  'support_2',
  'care_1',
  'care_2',
  'care_3',
  'care_4',
  'care_5',
] as const;

export type CareLevelValue = (typeof CARE_LEVEL_VALUES)[number];

export const CARE_LEVEL_LABELS: Record<CareLevelValue, string> = {
  support_1: '要支援1',
  support_2: '要支援2',
  care_1: '要介護1',
  care_2: '要介護2',
  care_3: '要介護3',
  care_4: '要介護4',
  care_5: '要介護5',
};

export class CareLevel {
  private constructor(private readonly _value: CareLevelValue) {}

  static of(value: string): CareLevel {
    if (!CARE_LEVEL_VALUES.includes(value as CareLevelValue)) {
      throw new ValidationError('careLevel', `Invalid care level: ${value}`);
    }
    return new CareLevel(value as CareLevelValue);
  }

  get value(): CareLevelValue {
    return this._value;
  }

  get label(): string {
    return CARE_LEVEL_LABELS[this._value];
  }

  equals(other: CareLevel): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}
