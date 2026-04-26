import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { CarePlanId } from './CarePlanId';
import { LongTermGoal } from './LongTermGoal';
import { LongTermGoalId } from './LongTermGoalId';
import { ShortTermGoal } from './ShortTermGoal';
import { ShortTermGoalId } from './ShortTermGoalId';
import { ServiceItem } from './ServiceItem';
import { ServiceItemId } from './ServiceItemId';
import { PlanPeriod } from './PlanPeriod';
import { CarePlanStatus } from './CarePlanStatus';
import { CarePlanValidationError } from './CarePlanValidationError';

export interface CarePlanReconstructProps {
  id: CarePlanId;
  tenantId: TenantId;
  careRecipientId: CareRecipientId;
  assessmentId: AssessmentId;
  planNumber: string;
  planPeriod: PlanPeriod;
  longTermGoals: LongTermGoal[];
  shortTermGoals: ShortTermGoal[];
  serviceItems: ServiceItem[];
  status: CarePlanStatus;
  createdBy: UserId;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
  version: number;
}

export class CarePlan {
  private constructor(
    private readonly _id: CarePlanId,
    private readonly _tenantId: TenantId,
    private readonly _careRecipientId: CareRecipientId,
    private readonly _assessmentId: AssessmentId,
    private _planNumber: string,
    private _planPeriod: PlanPeriod,
    private _longTermGoals: LongTermGoal[],
    private _shortTermGoals: ShortTermGoal[],
    private _serviceItems: ServiceItem[],
    private _status: CarePlanStatus,
    private readonly _createdBy: UserId,
    private readonly _createdAt: Date,
    private _updatedAt: Date,
    private _finalizedAt: Date | null,
    private _version: number,
  ) {}

  static create(params: {
    tenantId: TenantId;
    careRecipientId: CareRecipientId;
    assessmentId: AssessmentId;
    planNumber: string;
    planPeriod: PlanPeriod;
    longTermGoals: LongTermGoal[];
    shortTermGoals: ShortTermGoal[];
    serviceItems?: ServiceItem[];
    createdBy: UserId;
  }): CarePlan {
    if (params.planNumber.trim().length === 0) {
      throw new CarePlanValidationError('プラン番号は空にできません');
    }
    if (params.longTermGoals.length === 0) {
      throw new CarePlanValidationError('長期目標は最低 1 つ必要です');
    }
    if (params.shortTermGoals.length === 0) {
      throw new CarePlanValidationError('短期目標は最低 1 つ必要です');
    }
    CarePlan.validateGoalRelations(params.longTermGoals, params.shortTermGoals);
    CarePlan.validateSequenceUniqueness(params.longTermGoals, params.shortTermGoals, params.serviceItems ?? []);

    const now = new Date();
    return new CarePlan(
      CarePlanId.generate(),
      params.tenantId,
      params.careRecipientId,
      params.assessmentId,
      params.planNumber,
      params.planPeriod,
      [...params.longTermGoals],
      [...params.shortTermGoals],
      [...(params.serviceItems ?? [])],
      CarePlanStatus.Draft,
      params.createdBy,
      now,
      now,
      null,
      1,
    );
  }

  static reconstruct(props: CarePlanReconstructProps): CarePlan {
    return new CarePlan(
      props.id,
      props.tenantId,
      props.careRecipientId,
      props.assessmentId,
      props.planNumber,
      props.planPeriod,
      [...props.longTermGoals],
      [...props.shortTermGoals],
      [...props.serviceItems],
      props.status,
      props.createdBy,
      props.createdAt,
      props.updatedAt,
      props.finalizedAt,
      props.version,
    );
  }

  // ───── 編集 (Draft のみ) ─────

  addLongTermGoal(goal: LongTermGoal): void {
    this.assertEditable();
    if (this._longTermGoals.some((g) => g.sequenceNo === goal.sequenceNo)) {
      throw new CarePlanValidationError(
        `長期目標の sequence_no ${goal.sequenceNo} は既に使われています`,
      );
    }
    this._longTermGoals.push(goal);
    this.touch();
  }

  removeLongTermGoal(goalId: LongTermGoalId): void {
    this.assertEditable();
    if (this._longTermGoals.length === 1) {
      throw new CarePlanValidationError('長期目標は最低 1 つ残す必要があります');
    }
    // 配下の短期目標も削除されることを許可しない (まず再割り当てを促す)
    if (this._shortTermGoals.some((s) => s.parentLongTermGoalId.equals(goalId))) {
      throw new CarePlanValidationError(
        '配下に短期目標が残っているため削除できません。先に短期目標を削除または再割り当てしてください',
      );
    }
    this._longTermGoals = this._longTermGoals.filter((g) => !g.id.equals(goalId));
    this.touch();
  }

  updateLongTermGoal(goalId: LongTermGoalId, updater: (g: LongTermGoal) => void): void {
    this.assertEditable();
    const goal = this._longTermGoals.find((g) => g.id.equals(goalId));
    if (!goal) throw new CarePlanValidationError('長期目標が見つかりません');
    updater(goal);
    this.touch();
  }

  addShortTermGoal(goal: ShortTermGoal): void {
    this.assertEditable();
    const parentExists = this._longTermGoals.some((lt) =>
      lt.id.equals(goal.parentLongTermGoalId),
    );
    if (!parentExists) {
      throw new CarePlanValidationError(
        '短期目標は既存の長期目標に紐づく必要があります',
      );
    }
    if (this._shortTermGoals.some((s) => s.sequenceNo === goal.sequenceNo)) {
      throw new CarePlanValidationError(
        `短期目標の sequence_no ${goal.sequenceNo} は既に使われています`,
      );
    }
    this._shortTermGoals.push(goal);
    this.touch();
  }

  removeShortTermGoal(goalId: ShortTermGoalId): void {
    this.assertEditable();
    if (this._shortTermGoals.length === 1) {
      throw new CarePlanValidationError('短期目標は最低 1 つ残す必要があります');
    }
    // 配下のサービス項目の related を NULL に
    for (const s of this._serviceItems) {
      if (s.relatedShortTermGoalId && s.relatedShortTermGoalId.equals(goalId)) {
        s.update({ relatedShortTermGoalId: null });
      }
    }
    this._shortTermGoals = this._shortTermGoals.filter((g) => !g.id.equals(goalId));
    this.touch();
  }

  updateShortTermGoal(goalId: ShortTermGoalId, updater: (g: ShortTermGoal) => void): void {
    this.assertEditable();
    const goal = this._shortTermGoals.find((g) => g.id.equals(goalId));
    if (!goal) throw new CarePlanValidationError('短期目標が見つかりません');
    updater(goal);
    // 親が存在することを保証
    if (!this._longTermGoals.some((lt) => lt.id.equals(goal.parentLongTermGoalId))) {
      throw new CarePlanValidationError(
        '短期目標の親長期目標が見つかりません',
      );
    }
    this.touch();
  }

  addServiceItem(item: ServiceItem): void {
    this.assertEditable();
    if (item.relatedShortTermGoalId) {
      const parentId = item.relatedShortTermGoalId;
      if (!this._shortTermGoals.some((s) => s.id.equals(parentId))) {
        throw new CarePlanValidationError(
          'サービス項目の関連短期目標が見つかりません',
        );
      }
    }
    if (this._serviceItems.some((s) => s.sequenceNo === item.sequenceNo)) {
      throw new CarePlanValidationError(
        `サービス項目の sequence_no ${item.sequenceNo} は既に使われています`,
      );
    }
    this._serviceItems.push(item);
    this.touch();
  }

  removeServiceItem(itemId: ServiceItemId): void {
    this.assertEditable();
    const before = this._serviceItems.length;
    this._serviceItems = this._serviceItems.filter((s) => !s.id.equals(itemId));
    if (this._serviceItems.length === before) {
      throw new CarePlanValidationError('サービス項目が見つかりません');
    }
    this.touch();
  }

  updateServiceItem(itemId: ServiceItemId, updater: (s: ServiceItem) => void): void {
    this.assertEditable();
    const item = this._serviceItems.find((s) => s.id.equals(itemId));
    if (!item) throw new CarePlanValidationError('サービス項目が見つかりません');
    updater(item);
    if (item.relatedShortTermGoalId) {
      const ref = item.relatedShortTermGoalId;
      if (!this._shortTermGoals.some((s) => s.id.equals(ref))) {
        throw new CarePlanValidationError('関連短期目標が見つかりません');
      }
    }
    this.touch();
  }

  updatePlanPeriod(period: PlanPeriod): void {
    this.assertEditable();
    this._planPeriod = period;
    this.touch();
  }

  updatePlanNumber(planNumber: string): void {
    this.assertEditable();
    if (planNumber.trim().length === 0) {
      throw new CarePlanValidationError('プラン番号は空にできません');
    }
    this._planNumber = planNumber;
    this.touch();
  }

  // ───── 状態遷移 (3 状態: Draft → Finalized → Archived) ─────

  finalize(): void {
    if (this._status !== CarePlanStatus.Draft) {
      throw new IllegalStateTransitionError(
        this._status,
        CarePlanStatus.Finalized,
        `Draft 状態のケアプランのみ確定できます。現在: ${this._status}`,
      );
    }
    if (this._serviceItems.length === 0) {
      throw new CarePlanValidationError(
        '確定にはサービス内容が最低 1 つ必要です',
      );
    }
    if (this._longTermGoals.length === 0 || this._shortTermGoals.length === 0) {
      throw new CarePlanValidationError('長期・短期目標が最低 1 つ必要です');
    }
    const now = new Date();
    this._status = CarePlanStatus.Finalized;
    this._finalizedAt = now;
    this._updatedAt = now;
  }

  archive(): void {
    if (this._status !== CarePlanStatus.Finalized) {
      throw new IllegalStateTransitionError(
        this._status,
        CarePlanStatus.Archived,
        `Finalized 状態のケアプランのみ Archived に遷移できます。現在: ${this._status}`,
      );
    }
    this._status = CarePlanStatus.Archived;
    this._updatedAt = new Date();
  }

  // ───── ゲッター ─────
  get id(): CarePlanId {
    return this._id;
  }
  get tenantId(): TenantId {
    return this._tenantId;
  }
  get careRecipientId(): CareRecipientId {
    return this._careRecipientId;
  }
  get assessmentId(): AssessmentId {
    return this._assessmentId;
  }
  get planNumber(): string {
    return this._planNumber;
  }
  get planPeriod(): PlanPeriod {
    return this._planPeriod;
  }
  get status(): CarePlanStatus {
    return this._status;
  }
  get longTermGoals(): ReadonlyArray<LongTermGoal> {
    return this._longTermGoals;
  }
  get shortTermGoals(): ReadonlyArray<ShortTermGoal> {
    return this._shortTermGoals;
  }
  get serviceItems(): ReadonlyArray<ServiceItem> {
    return this._serviceItems;
  }
  get createdBy(): UserId {
    return this._createdBy;
  }
  get createdAt(): Date {
    return this._createdAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  get finalizedAt(): Date | null {
    return this._finalizedAt;
  }
  get version(): number {
    return this._version;
  }

  private assertEditable(): void {
    if (this._status !== CarePlanStatus.Draft) {
      throw new IllegalStateTransitionError(
        this._status,
        'edit',
        `編集可能なのは Draft 状態のみです。現在: ${this._status}`,
      );
    }
  }

  private touch(): void {
    this._updatedAt = new Date();
  }

  private static validateGoalRelations(
    longTermGoals: LongTermGoal[],
    shortTermGoals: ShortTermGoal[],
  ): void {
    const longIds = new Set(longTermGoals.map((g) => g.id.value));
    for (const st of shortTermGoals) {
      if (!longIds.has(st.parentLongTermGoalId.value)) {
        throw new CarePlanValidationError(
          `短期目標の親長期目標が存在しません: ${st.parentLongTermGoalId.value}`,
        );
      }
    }
  }

  private static validateSequenceUniqueness(
    longTermGoals: LongTermGoal[],
    shortTermGoals: ShortTermGoal[],
    serviceItems: ServiceItem[],
  ): void {
    const ltSeqs = longTermGoals.map((g) => g.sequenceNo);
    if (new Set(ltSeqs).size !== ltSeqs.length) {
      throw new CarePlanValidationError('長期目標の sequence_no が重複しています');
    }
    const stSeqs = shortTermGoals.map((g) => g.sequenceNo);
    if (new Set(stSeqs).size !== stSeqs.length) {
      throw new CarePlanValidationError('短期目標の sequence_no が重複しています');
    }
    const svcSeqs = serviceItems.map((s) => s.sequenceNo);
    if (new Set(svcSeqs).size !== svcSeqs.length) {
      throw new CarePlanValidationError('サービス項目の sequence_no が重複しています');
    }
  }
}
