import { describe, it, expect } from 'vitest';
import { CarePlan } from './CarePlan';
import { LongTermGoal } from './LongTermGoal';
import { ShortTermGoal } from './ShortTermGoal';
import { ServiceItem } from './ServiceItem';
import { LongTermGoalId } from './LongTermGoalId';
import { PlanPeriod } from './PlanPeriod';
import { CarePlanStatus } from './CarePlanStatus';
import { CarePlanValidationError } from './CarePlanValidationError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';

const tenantId = new TenantId('tenant-1');
const recipientId = new CareRecipientId('11111111-1111-1111-1111-111111111111');
const assessmentId = new AssessmentId('22222222-2222-2222-2222-222222222222');
const userId = new UserId('user-1');

function period(fromIso: string, toIso: string) {
  return PlanPeriod.create(new Date(fromIso), new Date(toIso));
}

function makePlan(opts?: { withService?: boolean }) {
  const longTerm = LongTermGoal.create({
    sequenceNo: 1,
    title: '在宅生活の継続',
    description: null,
    targetPeriod: period('2026-05-01', '2026-10-31'),
  });
  const shortTerm = ShortTermGoal.create({
    parentLongTermGoalId: longTerm.id,
    sequenceNo: 1,
    title: '入浴介助で清潔を保つ',
    description: null,
    targetPeriod: period('2026-05-01', '2026-07-31'),
  });
  const services = opts?.withService
    ? [
        ServiceItem.create({
          relatedShortTermGoalId: shortTerm.id,
          sequenceNo: 1,
          serviceType: '通所介護',
          serviceName: 'デイサービスA',
          frequencyText: '週3回',
        }),
      ]
    : [];

  return CarePlan.create({
    tenantId,
    careRecipientId: recipientId,
    assessmentId,
    planNumber: 'CP-2026-05',
    planPeriod: period('2026-05-01', '2026-10-31'),
    longTermGoals: [longTerm],
    shortTermGoals: [shortTerm],
    serviceItems: services,
    createdBy: userId,
  });
}

describe('CarePlan.create', () => {
  it('creates Draft plan with version=1', () => {
    const p = makePlan();
    expect(p.status).toBe(CarePlanStatus.Draft);
    expect(p.version).toBe(1);
    expect(p.finalizedAt).toBeNull();
    expect(p.longTermGoals).toHaveLength(1);
    expect(p.shortTermGoals).toHaveLength(1);
  });

  it('rejects when no long-term goals', () => {
    expect(() =>
      CarePlan.create({
        tenantId,
        careRecipientId: recipientId,
        assessmentId,
        planNumber: 'CP',
        planPeriod: period('2026-05-01', '2026-10-31'),
        longTermGoals: [],
        shortTermGoals: [],
        createdBy: userId,
      }),
    ).toThrow(CarePlanValidationError);
  });

  it('rejects orphan short-term goal', () => {
    const orphan = ShortTermGoal.create({
      parentLongTermGoalId: new LongTermGoalId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'),
      sequenceNo: 1,
      title: 'orphan',
      targetPeriod: period('2026-05-01', '2026-07-31'),
    });
    const lt = LongTermGoal.create({
      sequenceNo: 1,
      title: 'x',
      targetPeriod: period('2026-05-01', '2026-10-31'),
    });
    expect(() =>
      CarePlan.create({
        tenantId,
        careRecipientId: recipientId,
        assessmentId,
        planNumber: 'CP',
        planPeriod: period('2026-05-01', '2026-10-31'),
        longTermGoals: [lt],
        shortTermGoals: [orphan],
        createdBy: userId,
      }),
    ).toThrow(CarePlanValidationError);
  });
});

describe('CarePlan.finalize', () => {
  it('rejects without service items', () => {
    const p = makePlan();
    expect(() => p.finalize()).toThrow(CarePlanValidationError);
  });

  it('Draft -> Finalized with services', () => {
    const p = makePlan({ withService: true });
    p.finalize();
    expect(p.status).toBe(CarePlanStatus.Finalized);
    expect(p.finalizedAt).not.toBeNull();
  });

  it('rejects re-finalize', () => {
    const p = makePlan({ withService: true });
    p.finalize();
    expect(() => p.finalize()).toThrow(IllegalStateTransitionError);
  });
});

describe('CarePlan.archive', () => {
  it('Finalized -> Archived', () => {
    const p = makePlan({ withService: true });
    p.finalize();
    p.archive();
    expect(p.status).toBe(CarePlanStatus.Archived);
  });

  it('Draft -> Archived rejected', () => {
    const p = makePlan({ withService: true });
    expect(() => p.archive()).toThrow(IllegalStateTransitionError);
  });
});

describe('CarePlan editing (Draft only)', () => {
  it('addServiceItem requires editable', () => {
    const p = makePlan({ withService: true });
    p.finalize();
    const newItem = ServiceItem.create({
      sequenceNo: 2,
      serviceType: '訪問介護',
      serviceName: 'ヘルパー',
    });
    expect(() => p.addServiceItem(newItem)).toThrow(IllegalStateTransitionError);
  });

  it('removeShortTermGoal nullifies related service items', () => {
    const p = makePlan({ withService: true });
    // 短期目標がもう 1 件必要なので追加してから削除
    const lt = p.longTermGoals[0]!;
    p.addShortTermGoal(
      ShortTermGoal.create({
        parentLongTermGoalId: lt.id,
        sequenceNo: 2,
        title: 'B',
        targetPeriod: period('2026-05-01', '2026-07-31'),
      }),
    );
    const targetId = p.shortTermGoals[0]!.id;
    p.removeShortTermGoal(targetId);
    // 元のサービス項目の関連は null になっている
    expect(p.serviceItems[0]!.relatedShortTermGoalId).toBeNull();
  });

  it('removeLongTermGoal blocked if children exist', () => {
    const p = makePlan({ withService: true });
    expect(() => p.removeLongTermGoal(p.longTermGoals[0]!.id)).toThrow(CarePlanValidationError);
  });
});

describe('PlanPeriod', () => {
  it('rejects from >= to', () => {
    expect(() => PlanPeriod.create(new Date('2026-05-01'), new Date('2026-05-01'))).toThrow();
  });

  it('contains works', () => {
    const p = PlanPeriod.create(new Date('2026-05-01'), new Date('2026-10-31'));
    expect(p.contains(new Date('2026-07-01'))).toBe(true);
    expect(p.contains(new Date('2027-01-01'))).toBe(false);
  });
});
