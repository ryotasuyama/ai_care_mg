import { describe, it, expect } from 'vitest';
import { Assessment } from './Assessment';
import { AssessmentIssue } from './AssessmentIssue';
import { AssessmentIssueId } from './AssessmentIssueId';
import { PlaceholderMapSnapshot } from './PlaceholderMapSnapshot';
import { AssessmentStatus } from './AssessmentStatus';
import { AssessmentValidationError } from './AssessmentValidationError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';

const tenantId = new TenantId('tenant-1');
const careRecipientId = new CareRecipientId('11111111-2222-3333-4444-555555555555');
const createdBy = new UserId('user-1');

function makeIssue(seq = 1, description = '膝の痛み') {
  return AssessmentIssue.create({
    category: 'health',
    description,
    priority: 'medium',
    sequenceNo: seq,
  });
}

function baseInput(overrides: Partial<Parameters<typeof Assessment.create>[0]> = {}) {
  return {
    tenantId,
    careRecipientId,
    type: 'initial' as const,
    issues: [makeIssue()],
    sourceTranscript: '田中太郎さんは膝が痛い',
    maskedSummary: '{RECIPIENT_NAME_001} さんは膝が痛い',
    placeholderMap: PlaceholderMapSnapshot.create([
      { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
    ]),
    conductedAt: new Date('2026-04-20'),
    createdBy,
    ...overrides,
  };
}

describe('Assessment.create', () => {
  it('creates a Draft assessment with version=1', () => {
    const a = Assessment.create(baseInput());
    expect(a.status).toBe(AssessmentStatus.Draft);
    expect(a.version).toBe(1);
    expect(a.issues).toHaveLength(1);
    expect(a.finalizedAt).toBeNull();
  });

  it('throws when no issues provided', () => {
    expect(() => Assessment.create(baseInput({ issues: [] }))).toThrow(AssessmentValidationError);
  });

  it('throws when sourceTranscript is empty', () => {
    expect(() => Assessment.create(baseInput({ sourceTranscript: '   ' }))).toThrow(
      AssessmentValidationError,
    );
  });

  it('throws when maskedSummary is empty', () => {
    expect(() => Assessment.create(baseInput({ maskedSummary: '' }))).toThrow(
      AssessmentValidationError,
    );
  });

  it('throws when sequence_no duplicates', () => {
    const issues = [makeIssue(1), makeIssue(1)];
    expect(() => Assessment.create(baseInput({ issues }))).toThrow(AssessmentValidationError);
  });
});

describe('Assessment.finalize', () => {
  it('transitions Draft -> Finalized and sets finalizedAt', () => {
    const a = Assessment.create(baseInput());
    a.finalize();
    expect(a.status).toBe(AssessmentStatus.Finalized);
    expect(a.finalizedAt).not.toBeNull();
  });

  it('rejects re-finalize', () => {
    const a = Assessment.create(baseInput());
    a.finalize();
    expect(() => a.finalize()).toThrow(IllegalStateTransitionError);
  });
});

describe('Assessment.addIssue / removeIssue', () => {
  it('addIssue appends and disallows duplicate sequenceNo', () => {
    const a = Assessment.create(baseInput());
    a.addIssue(makeIssue(2, 'IADL不安'));
    expect(a.issues).toHaveLength(2);
    expect(() => a.addIssue(makeIssue(2, '別'))).toThrow(AssessmentValidationError);
  });

  it('removeIssue refuses to remove the last issue', () => {
    const a = Assessment.create(baseInput());
    expect(() => a.removeIssue(a.issues[0]!.id)).toThrow(AssessmentValidationError);
  });

  it('removeIssue removes a non-last issue', () => {
    const a = Assessment.create(baseInput({ issues: [makeIssue(1), makeIssue(2, 'B')] }));
    const target = a.issues[1]!.id;
    a.removeIssue(target);
    expect(a.issues).toHaveLength(1);
    expect(a.issues[0]!.sequenceNo).toBe(1);
  });

  it('addIssue is rejected when Finalized', () => {
    const a = Assessment.create(baseInput());
    a.finalize();
    expect(() => a.addIssue(makeIssue(2, 'B'))).toThrow(IllegalStateTransitionError);
  });
});

describe('Assessment.updateIssue', () => {
  it('updates issue via callback', () => {
    const a = Assessment.create(baseInput());
    const issueId = a.issues[0]!.id;
    a.updateIssue(issueId, (i) => i.updateDescription('修正済み'));
    expect(a.issues[0]!.description).toBe('修正済み');
  });

  it('throws if issue id not found', () => {
    const a = Assessment.create(baseInput());
    expect(() =>
      a.updateIssue(
        new AssessmentIssueId('99999999-9999-9999-9999-999999999999'),
        () => {},
      ),
    ).toThrow(AssessmentValidationError);
  });
});

describe('Assessment unmask helpers', () => {
  it('getUnmaskedSummary replaces placeholders', () => {
    const a = Assessment.create(baseInput());
    expect(a.getUnmaskedSummary()).toBe('田中太郎 さんは膝が痛い');
  });

  it('getUnmaskedIssueDescription replaces placeholders within issue', () => {
    const issue = AssessmentIssue.create({
      category: 'health',
      description: '{RECIPIENT_NAME_001} さんに膝痛',
      priority: 'medium',
      sequenceNo: 1,
    });
    const a = Assessment.create(baseInput({ issues: [issue] }));
    expect(a.getUnmaskedIssueDescription(issue.id)).toBe('田中太郎 さんに膝痛');
  });
});
