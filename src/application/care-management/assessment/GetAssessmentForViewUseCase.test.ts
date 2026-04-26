import { describe, it, expect, vi } from 'vitest';
import { GetAssessmentForViewUseCase } from './GetAssessmentForViewUseCase';
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

function makeAuth() {
  return { tenantId, userId, role: 'care_manager' as const };
}

function makeRepo(assessment: Assessment | null): IAssessmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(assessment),
    findAll: vi.fn(),
    findByRecipient: vi.fn(),
    findLatestFinalizedByRecipient: vi.fn(),
    save: vi.fn(),
  };
}

describe('GetAssessmentForViewUseCase', () => {
  it('happy path: returns DTO with unmasked content', async () => {
    const assessment = makeAssessment();
    const repo = makeRepo(assessment);
    const uc = new GetAssessmentForViewUseCase(repo);

    const dto = await uc.execute({ auth: makeAuth(), assessmentId: assessment.id.value });

    expect(dto.id).toBe(assessment.id.value);
    expect(dto.status).toBe(AssessmentStatus.Draft);
    expect(dto.summary).toBe('田中太郎は膝が痛い');
    expect(dto.issues).toHaveLength(1);
    expect(dto.issues[0]!.description).toBe('田中太郎は歩行困難');
  });

  it('throws NOT_FOUND when assessment does not exist', async () => {
    const repo = makeRepo(null);
    const uc = new GetAssessmentForViewUseCase(repo);

    const err = await uc
      .execute({ auth: makeAuth(), assessmentId: AssessmentId.generate().value })
      .catch((e) => e);

    expect(err).toBeInstanceOf(UseCaseError);
    expect(err.code).toBe('NOT_FOUND');
  });
});
