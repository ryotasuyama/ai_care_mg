import { LongTermGoalId } from './LongTermGoalId';
import { PlanPeriod } from './PlanPeriod';
import { CarePlanValidationError } from './CarePlanValidationError';

export class LongTermGoal {
  private constructor(
    private readonly _id: LongTermGoalId,
    private _sequenceNo: number,
    private _title: string,
    private _description: string | null,
    private _targetPeriod: PlanPeriod,
  ) {}

  static create(params: {
    sequenceNo: number;
    title: string;
    description?: string | null;
    targetPeriod: PlanPeriod;
  }): LongTermGoal {
    if (params.title.trim().length === 0) {
      throw new CarePlanValidationError('長期目標のタイトルは空にできません');
    }
    return new LongTermGoal(
      LongTermGoalId.generate(),
      params.sequenceNo,
      params.title,
      params.description ?? null,
      params.targetPeriod,
    );
  }

  static reconstruct(params: {
    id: LongTermGoalId;
    sequenceNo: number;
    title: string;
    description: string | null;
    targetPeriod: PlanPeriod;
  }): LongTermGoal {
    return new LongTermGoal(
      params.id,
      params.sequenceNo,
      params.title,
      params.description,
      params.targetPeriod,
    );
  }

  updateTitle(title: string): void {
    if (title.trim().length === 0) {
      throw new CarePlanValidationError('長期目標のタイトルは空にできません');
    }
    this._title = title;
  }

  updateDescription(description: string | null): void {
    this._description = description;
  }

  updateTargetPeriod(period: PlanPeriod): void {
    this._targetPeriod = period;
  }

  get id(): LongTermGoalId {
    return this._id;
  }
  get sequenceNo(): number {
    return this._sequenceNo;
  }
  get title(): string {
    return this._title;
  }
  get description(): string | null {
    return this._description;
  }
  get targetPeriod(): PlanPeriod {
    return this._targetPeriod;
  }
}
