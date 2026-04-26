import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseAssessmentDraftRepository } from './SupabaseAssessmentDraftRepository';
import { TenantId } from '@/domain/shared/TenantId';
import { ASSESSMENT_DRAFT_TTL_MS } from '@/domain/care-management/assessment/IAssessmentDraftRepository';

function makeRow(createdAt: Date) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: '22222222-2222-2222-2222-222222222222',
    care_recipient_id: '33333333-3333-3333-3333-333333333333',
    original_text: '田中太郎さんは...',
    masked_text: '{RECIPIENT_NAME_001} さんは...',
    placeholder_map: [
      { token: '{RECIPIENT_NAME_001}', originalValue: '田中太郎', category: 'recipient_name' },
    ],
    created_by: '44444444-4444-4444-4444-444444444444',
    created_at: createdAt.toISOString(),
  };
}

function makeMockSupabase(row: ReturnType<typeof makeRow> | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      }),
    }),
  };
}

describe('SupabaseAssessmentDraftRepository.findById TTL', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-25T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const tenantId = new TenantId('22222222-2222-2222-2222-222222222222');

  it('returns the draft when within TTL', async () => {
    const recent = new Date(Date.now() - 60_000); // 1 分前
    const row = makeRow(recent);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new SupabaseAssessmentDraftRepository(makeMockSupabase(row) as any);
    const draft = await repo.findById(row.id, tenantId);
    expect(draft).not.toBeNull();
    expect(draft!.maskingResult.placeholders).toHaveLength(1);
  });

  it('returns null when TTL has expired', async () => {
    const old = new Date(Date.now() - (ASSESSMENT_DRAFT_TTL_MS + 1000));
    const row = makeRow(old);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new SupabaseAssessmentDraftRepository(makeMockSupabase(row) as any);
    const draft = await repo.findById(row.id, tenantId);
    expect(draft).toBeNull();
  });

  it('returns null when row does not exist', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const repo = new SupabaseAssessmentDraftRepository(makeMockSupabase(null) as any);
    const draft = await repo.findById('any-id', tenantId);
    expect(draft).toBeNull();
  });
});
