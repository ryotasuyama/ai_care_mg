import { describe, it, expect } from 'vitest';
import { AssessmentMapper } from './AssessmentMapper';
import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentIssue } from '@/domain/care-management/assessment/AssessmentIssue';
import { PlaceholderMapSnapshot } from '@/domain/care-management/assessment/PlaceholderMapSnapshot';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';

function makeAssessment() {
  const issue1 = AssessmentIssue.create({
    category: 'health',
    description: '{RECIPIENT_NAME_001} さんは膝痛',
    priority: 'medium',
    sequenceNo: 1,
  });
  const issue2 = AssessmentIssue.create({
    category: 'adl',
    description: '歩行に介助が必要',
    priority: 'high',
    sequenceNo: 2,
  });
  return Assessment.create({
    tenantId: new TenantId('11111111-1111-1111-1111-111111111111'),
    careRecipientId: new CareRecipientId('22222222-2222-2222-2222-222222222222'),
    type: 'initial',
    issues: [issue1, issue2],
    sourceTranscript: '田中太郎さんは膝が痛い',
    maskedSummary: '{RECIPIENT_NAME_001} さんは膝が痛い',
    placeholderMap: PlaceholderMapSnapshot.create([
      { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
    ]),
    conductedAt: new Date('2026-04-20'),
    createdBy: new UserId('33333333-3333-3333-3333-333333333333'),
  });
}

describe('AssessmentMapper round-trip', () => {
  it('toPersistence -> toDomain preserves identity (incl. issue ids)', () => {
    const original = makeAssessment();
    const payload = AssessmentMapper.toPersistence(original);

    // RPC 経由を模擬: payload を行データに展開
    const assessmentRow = {
      id: payload.assessment.id,
      tenant_id: payload.assessment.tenant_id,
      care_recipient_id: payload.assessment.care_recipient_id,
      type: payload.assessment.type,
      status: payload.assessment.status,
      conducted_at: payload.assessment.conducted_at,
      source_transcript: payload.assessment.source_transcript,
      masked_summary: payload.assessment.masked_summary,
      placeholder_map: payload.assessment.placeholder_map as unknown as import('@/types/database').Json,
      created_by: payload.assessment.created_by,
      created_at: payload.assessment.created_at,
      updated_at: payload.assessment.updated_at,
      finalized_at: payload.assessment.finalized_at,
      version: payload.assessment.version,
    };
    const issueRows = payload.issues.map((i) => ({
      id: i.id,
      tenant_id: payload.assessment.tenant_id,
      assessment_id: payload.assessment.id,
      sequence_no: i.sequence_no,
      category: i.category,
      description: i.description,
      priority: i.priority,
      created_at: payload.assessment.created_at,
      updated_at: payload.assessment.updated_at,
    }));

    const restored = AssessmentMapper.toDomain({ assessment: assessmentRow, issues: issueRows });

    expect(restored.id.value).toBe(original.id.value);
    expect(restored.issues).toHaveLength(2);
    expect(restored.issues[0]!.id.value).toBe(original.issues[0]!.id.value);
    expect(restored.issues[1]!.id.value).toBe(original.issues[1]!.id.value);
    expect(restored.getUnmaskedSummary()).toBe('田中太郎 さんは膝が痛い');
    expect(restored.version).toBe(original.version);
  });

  it('payload includes child IDs for permanence contract', () => {
    const a = makeAssessment();
    const payload = AssessmentMapper.toPersistence(a);
    expect(payload.issues[0]!.id).toBe(a.issues[0]!.id.value);
    expect(payload.issues[1]!.id).toBe(a.issues[1]!.id.value);
  });
});
