import { CarePlanValidationError } from './CarePlanValidationError';

export class PlanPeriod {
  private constructor(
    public readonly from: Date,
    public readonly to: Date,
  ) {}

  static create(from: Date, to: Date): PlanPeriod {
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new CarePlanValidationError('計画期間の日付が不正です');
    }
    if (from.getTime() >= to.getTime()) {
      throw new CarePlanValidationError(
        '計画期間の開始日は終了日より前である必要があります',
      );
    }
    return new PlanPeriod(new Date(from), new Date(to));
  }

  static reconstruct(from: Date, to: Date): PlanPeriod {
    return new PlanPeriod(new Date(from), new Date(to));
  }

  contains(date: Date): boolean {
    return date.getTime() >= this.from.getTime() && date.getTime() <= this.to.getTime();
  }

  equals(other: PlanPeriod): boolean {
    return this.from.getTime() === other.from.getTime()
      && this.to.getTime() === other.to.getTime();
  }
}
