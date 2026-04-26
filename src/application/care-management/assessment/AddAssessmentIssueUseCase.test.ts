import { describe, it, expect, vi } from 'vitest';
import { AddAssessmentIssueUseCase } from './AddAssessmentIssueUseCase';
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
    description: '{RECIPIENT_NAME_001}は歩行困難',
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
    placeholderMap: PlaceholderMapSnapshot.create([
      { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
    ]),
    conductedAt: new Date('2026-04-25'),
    createdBy: new UserId(userId),
  });
}

function makeFinalizedAssessment(): Assessment {
  const issue = AssessmentIssue.create({ category: 'adl', description: '歩行困難', priority: 'high', sequenceNo: 1 });
  const draft = Assessment.create({
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
  return Assessment.reconstruct({
    id: draft.id,
    tenantId: draft.tenantId,
    careRecipientId: draft.careRecipientId,
    type: draft.type,
    issues: [...draft.issues],
    sourceTranscript: draft.sourceTranscript,
    maskedSummary: draft.maskedSummary,
    placeholderMap: draft.placeholderMap,
    status: AssessmentStatus.Finalized,
    conductedAt: draft.conductedAt,
    createdBy: draft.createdBy,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
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

describe('AddAssessmentIssueUseCase', () => {
  it('happy path: adds issue and returns issueId', async () => {
    const repo = makeRepo();
    const uc = new AddAssessmentIssueUseCase(repo);

    const result = await uc.execute({
      auth: makeAuth(),
      assessmentId: AssessmentId.generate().value,
      category: 'health',
      description: '血圧が高い',
      priority: 'medium',
    });

    expect(result.issueId).toBeTruthy();
    expect(repo.save).toHaveBeenCalled();
  });

  it('throws NOT_FOUND when assessment does not exist', async () => {
    const repo = makeRepo(null);
    const uc = new AddAssessmentIssueUseCase(repo);

    await expect(
      uc.execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        category: 'adl',
        description: '歩行困難',
        priority: 'high',
      }),
    ).rejects.toThrow(UseCaseError);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        category: 'adl',
        description: '歩行困難',
        priority: 'high',
      })
      .catch((e) => e);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('throws INVALID_INPUT when assessment is finalized', async () => {
    const repo = makeRepo(makeFinalizedAssessment());
    const uc = new AddAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        category: 'adl',
        description: '歩行困難',
        priority: 'high',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('INVALID_INPUT');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('converts OptimisticLockError to CONFLICT', async () => {
    const repo = makeRepo();
    (repo.save as ReturnType<typeof vi.fn>).mockRejectedValue(new OptimisticLockError());
    const uc = new AddAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        category: 'adl',
        description: '歩行困難',
        priority: 'high',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('CONFLICT');
  });

  it('throws INVALID_INPUT for empty description (Zod)', async () => {
    const repo = makeRepo();
    const uc = new AddAssessmentIssueUseCase(repo);

    const err = await uc
      .execute({
        auth: makeAuth(),
        assessmentId: AssessmentId.generate().value,
        category: 'adl',
        description: '',
        priority: 'high',
      })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('INVALID_INPUT');
  });
});
