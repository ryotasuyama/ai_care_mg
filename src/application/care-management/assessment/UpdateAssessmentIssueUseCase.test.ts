import { describe, it, expect, vi } from 'vitest';
import { UpdateAssessmentIssueUseCase } from './UpdateAssessmentIssueUseCase';
import { UseCaseError } from '@/application/shared/UseCaseError';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
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
    sourceTranscript: 'transcript',
    maskedSummary: 'masked',
    placeholderMap: PlaceholderMapSnapshot.create([]),
    conductedAt: new Date('2026-04-25'),
    createdBy: new UserId(userId),
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

describe('UpdateAssessmentIssueUseCase', () => {
  it('happy path: updates description and saves', async () => {
    const assessment = makeAssessment();
    const issueId = assessment.issues[0]!.id.value;
    const repo = makeRepo(assessment);
    const uc = new UpdateAssessmentIssueUseCase(repo);

    await uc.execute({
      auth: makeAuth(),
      assessmentId: assessment.id.value,
      issueId,
      description: '更新後の説明',
    });

    expect(repo.save).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when assessment does not exist', async () => {
    const repo = makeRepo(null);
    const uc = new UpdateAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        issueId: AssessmentId.generate().value,
        description: '更新後',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws INVALID_INPUT when issue does not exist in assessment', async () => {
    const repo = makeRepo();
    const uc = new UpdateAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        issueId: AssessmentId.generate().value,
        description: '存在しない課題',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('INVALID_INPUT');
  });

  it('converts OptimisticLockError to CONFLICT', async () => {
    const assessment = makeAssessment();
    const repo = makeRepo(assessment);
    (repo.save as ReturnType<typeof vi.fn>).mockRejectedValue(new OptimisticLockError());
    const uc = new UpdateAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: assessment.id.value,
        issueId: assessment.issues[0]!.id.value,
        description: '更新後',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('CONFLICT');
  });
});
