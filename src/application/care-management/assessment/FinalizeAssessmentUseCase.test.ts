import { describe, it, expect, vi } from 'vitest';
import { FinalizeAssessmentUseCase } from './FinalizeAssessmentUseCase';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import { PlaceholderMapSnapshot } from '@/domain/care-management/assessment/PlaceholderMapSnapshot';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const careRecipientId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function makeAssessment(): Assessment {
  const issue = AssessmentIssue.create({
    category: 'adl',
    description: '歩行困難',
    priority: 'high',
    sequenceNo: 1,
  });
  return Assessment.create({
    tenantId: new TenantId(tenantId),
    careRecipientId: new CareRecipientId(careRecipientId),
    type: 'initial',
    issues: [issue],
    sourceTranscript: '田中太郎は膝が痛い',
    maskedSummary: '{RECIPIENT_NAME_001}は膝が痛い',
    placeholderMap: PlaceholderMapSnapshot.create([]),
    conductedAt: new Date('2026-04-25'),
    createdBy: new UserId(userId),
  });
}

function makeFinalizedAssessment(): Assessment {
  const base = makeAssessment();
  return Assessment.reconstruct({
    id: base.id,
    tenantId: base.tenantId,
    careRecipientId: base.careRecipientId,
    type: base.type,
    issues: [...base.issues],
    sourceTranscript: base.sourceTranscript,
    maskedSummary: base.maskedSummary,
    placeholderMap: base.placeholderMap,
    status: AssessmentStatus.Finalized,
    conductedAt: base.conductedAt,
    createdBy: base.createdBy,
    createdAt: base.createdAt,
    updatedAt: base.updatedAt,
    finalizedAt: new Date(),
    version: 2,
  });
}

function makeAuth() {
  return { tenantId, userId, role: 'care_manager' as const };
}

function makeRepo(assessment: Assessment | null = makeAssessment()): IAssessmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(assessment),
    findAll: vi.fn(),
    findByRecipient: vi.fn(),
    findLatestFinalizedByRecipient: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('FinalizeAssessmentUseCase', () => {
  it('happy path: finalizes assessment and saves', async () => {
    const assessment = makeAssessment();
    const repo = makeRepo(assessment);
    const uc = new FinalizeAssessmentUseCase(repo);

    await uc.execute({ auth: makeAuth(), assessmentId: assessment.id.value });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: AssessmentStatus.Finalized }),
    );
  });

  it('throws NOT_FOUND when assessment does not exist', async () => {
    const repo = makeRepo(null);
    const uc = new FinalizeAssessmentUseCase(repo);

    const err = await uc
      .execute({ auth: makeAuth(), assessmentId: AssessmentId.generate().value })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws INVALID_INPUT when already finalized', async () => {
    const repo = makeRepo(makeFinalizedAssessment());
    const uc = new FinalizeAssessmentUseCase(repo);

    const err = await uc
      .execute({ auth: makeAuth(), assessmentId: AssessmentId.generate().value })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('INVALID_INPUT');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('converts OptimisticLockError to CONFLICT', async () => {
    const repo = makeRepo();
    (repo.save as ReturnType<typeof vi.fn>).mockRejectedValue(new OptimisticLockError());
    const uc = new FinalizeAssessmentUseCase(repo);

    const err = await uc
      .execute({ auth: makeAuth(), assessmentId: AssessmentId.generate().value })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('CONFLICT');
  });
});
