import { ShortTermGoalId } from './ShortTermGoalId';
import { LongTermGoalId } from './LongTermGoalId';
import { PlanPeriod } from './PlanPeriod';
import { CarePlanValidationError } from './CarePlanValidationError';

export class ShortTermGoal {
  private constructor(
    private readonly _id: ShortTermGoalId,
    private _parentLongTermGoalId: LongTermGoalId,
    private _sequenceNo: number,
    private _title: string,
    private _description: string | null,
    private _targetPeriod: PlanPeriod,
  ) {}

  static create(params: {
    parentLongTermGoalId: LongTermGoalId;
    sequenceNo: number;
    title: string;
    description?: string | null;
    targetPeriod: PlanPeriod;
  }): ShortTermGoal {
    if (params.title.trim().length === 0) {
      throw new CarePlanValidationError('短期目標のタイトルは空にできません');
    }
    return new ShortTermGoal(
      ShortTermGoalId.generate(),
      params.parentLongTermGoalId,
      params.sequenceNo,
      params.title,
      params.description ?? null,
      params.targetPeriod,
    );
  }

  static reconstruct(params: {
    id: ShortTermGoalId;
    parentLongTermGoalId: LongTermGoalId;
    sequenceNo: number;
    title: string;
    description: string | null;
    targetPeriod: PlanPeriod;
  }): ShortTermGoal {
    return new ShortTermGoal(
      params.id,
      params.parentLongTermGoalId,
      params.sequenceNo,
      params.title,
      params.description,
      params.targetPeriod,
    );
  }

  updateTitle(title: string): void {
    if (title.trim().length === 0) {
      throw new CarePlanValidationError('短期目標のタイトルは空にできません');
    }
    this._title = title;
  }

  updateDescription(description: string | null): void {
    this._description = description;
  }

  updateTargetPeriod(period: PlanPeriod): void {
    this._targetPeriod = period;
  }

  reassignParent(parentId: LongTermGoalId): void {
    this._parentLongTermGoalId = parentId;
  }

  get id(): ShortTermGoalId {
    return this._id;
  }
  get parentLongTermGoalId(): LongTermGoalId {
    return this._parentLongTermGoalId;
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
