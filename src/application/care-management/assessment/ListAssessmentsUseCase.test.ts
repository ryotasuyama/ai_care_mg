import { describe, it, expect, vi } from 'vitest';
import { ListAssessmentsUseCase } from './ListAssessmentsUseCase';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import type { ICareRecipientRepository } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import { CareRecipient } from '@/domain/care-management/care-recipient/CareRecipient';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { CareLevel } from '@/domain/care-management/care-recipient/CareLevel';
import { PlaceholderMapSnapshot } from '@/domain/care-management/assessment/PlaceholderMapSnapshot';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';

const tenantId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const careRecipientId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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

function makeRecipient(): CareRecipient {
  return CareRecipient.create({
    tenantId: new TenantId(tenantId),
    fullName: '田中太郎',
    dateOfBirth: new Date('1940-01-01'),
    address: '東京都',
    currentCareLevel: CareLevel.of('care_2'),
    createdBy: new UserId(userId),
  });
}

function makeAuth() {
  return { tenantId, userId, role: 'care_manager' as const };
}

function makeAssessmentRepo(assessments: Assessment[]): IAssessmentRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue(assessments),
    findByRecipient: vi.fn().mockResolvedValue(assessments),
    findLatestFinalizedByRecipient: vi.fn(),
    save: vi.fn(),
  };
}

function makeRecipientRepo(recipients: CareRecipient[]): ICareRecipientRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue(recipients),
    save: vi.fn(),
    buildKnownPiiSetForTenant: vi.fn(),
  };
}

describe('ListAssessmentsUseCase', () => {
  it('without careRecipientId: uses findAll and returns mapped DTOs', async () => {
    const assessment = makeAssessment();
    const recipient = makeRecipient();
    const assessmentRepo = makeAssessmentRepo([assessment]);
    const recipientRepo = makeRecipientRepo([recipient]);

    const uc = new ListAssessmentsUseCase(assessmentRepo, recipientRepo);
    const result = await uc.execute({ auth: makeAuth() });

    expect(assessmentRepo.findAll).toHaveBeenCalled();
    expect(assessmentRepo.findByRecipient).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]!.issueCount).toBe(1);
  });

  it('with careRecipientId: uses findByRecipient', async () => {
    const assessment = makeAssessment();
    const recipient = makeRecipient();
    const assessmentRepo = makeAssessmentRepo([assessment]);
    const recipientRepo = makeRecipientRepo([recipient]);

    const uc = new ListAssessmentsUseCase(assessmentRepo, recipientRepo);
    await uc.execute({ auth: makeAuth(), careRecipientId });

    expect(assessmentRepo.findByRecipient).toHaveBeenCalled();
    expect(assessmentRepo.findAll).not.toHaveBeenCalled();
  });

  it('empty result: returns [] without calling recipient repo', async () => {
    const assessmentRepo = makeAssessmentRepo([]);
    const recipientRepo = makeRecipientRepo([]);

    const uc = new ListAssessmentsUseCase(assessmentRepo, recipientRepo);
    const result = await uc.execute({ auth: makeAuth() });

    expect(result).toEqual([]);
    expect(recipientRepo.findAll).not.toHaveBeenCalled();
  });
});
