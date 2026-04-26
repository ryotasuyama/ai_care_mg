import { describe, it, expect, vi } from 'vitest';
import { RemoveAssessmentIssueUseCase } from './RemoveAssessmentIssueUseCase';
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

function makeAssessmentWith(issueCount: 1 | 2): Assessment {
  const issues = Array.from({ length: issueCount }, (_, i) =>
    AssessmentIssue.create({
      category: 'adl',
      description: `課題 ${i + 1}`,
      priority: 'high',
      sequenceNo: i + 1,
    }),
  );
  return Assessment.create({
    tenantId: new TenantId(tenantId),
    careRecipientId: new CareRecipientId(careRecipientId),
    type: 'initial',
    issues,
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

function makeRepo(assessment: Assessment | null): IAssessmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(assessment),
    findAll: vi.fn(),
    findByRecipient: vi.fn(),
    findLatestFinalizedByRecipient: vi.fn(),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

describe('RemoveAssessmentIssueUseCase', () => {
  it('happy path: removes one of two issues', async () => {
    const assessment = makeAssessmentWith(2);
    const issueToRemove = assessment.issues[0]!;
    const repo = makeRepo(assessment);
    const uc = new RemoveAssessmentIssueUseCase(repo);

    await uc.execute({
      auth: makeAuth(),
      assessmentId: assessment.id.value,
      issueId: issueToRemove.id.value,
    });

    expect(repo.save).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when assessment does not exist', async () => {
    const repo = makeRepo(null);
    const uc = new RemoveAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        issueId: AssessmentId.generate().value,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws INVALID_INPUT when removing the last issue', async () => {
    const assessment = makeAssessmentWith(1);
    const repo = makeRepo(assessment);
    const uc = new RemoveAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: assessment.id.value,
        issueId: assessment.issues[0]!.id.value,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('INVALID_INPUT');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('converts OptimisticLockError to CONFLICT', async () => {
    const assessment = makeAssessmentWith(2);
    const repo = makeRepo(assessment);
    (repo.save as ReturnType<typeof vi.fn>).mockRejectedValue(new OptimisticLockError());
    const uc = new RemoveAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: assessment.id.value,
        issueId: assessment.issues[0]!.id.value,
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('CONFLICT');
  });
});
