import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { IAssessmentRepository } from '@/domain/care-management/assessment/IAssessmentRepository';
import { Assessment } from '@/domain/care-management/assessment/Assessment';
import { AssessmentId } from '@/domain/care-management/assessment/AssessmentId';
import type { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { TenantId } from '@/domain/shared/TenantId';
import { AssessmentMapper } from './mappers/AssessmentMapper';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryError';
  }
}

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];
type AssessmentIssueRow = Database['public']['Tables']['assessment_issues']['Row'];

export class SupabaseAssessmentRepository implements IAssessmentRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: AssessmentId, tenantId: TenantId): Promise<Assessment | null> {
    const [{ data: assessmentRow, error: aErr }, { data: issueRows, error: iErr }] =
      await Promise.all([
        this.supabase
          .from('assessments')
          .select('*')
          .eq('id', id.value)
          .eq('tenant_id', tenantId.value)
          .maybeSingle(),
        this.supabase
          .from('assessment_issues')
          .select('*')
          .eq('assessment_id', id.value)
          .eq('tenant_id', tenantId.value)
          .order('sequence_no'),
      ]);

    if (aErr) throw new RepositoryError(aErr.message);
    if (iErr) throw new RepositoryError(iErr.message);
    if (!assessmentRow) return null;

    return AssessmentMapper.toDomain({
      assessment: assessmentRow,
      issues: issueRows ?? [],
    });
  }

  async findAll(tenantId: TenantId): Promise<Assessment[]> {
    const { data, error } = await this.supabase
      .from('assessments')
      .select('*')
      .eq('tenant_id', tenantId.value)
      .order('conducted_at', { ascending: false });
    if (error) throw new RepositoryError(error.message);
    return this.hydrateMany(data ?? []);
  }

  async findByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment[]> {
    const { data, error } = await this.supabase
      .from('assessments')
      .select('*')
      .eq('tenant_id', tenantId.value)
      .eq('care_recipient_id', recipientId.value)
      .order('conducted_at', { ascending: false });
    if (error) throw new RepositoryError(error.message);
    return this.hydrateMany(data ?? []);
  }

  async findLatestFinalizedByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<Assessment | null> {
    const { data, error } = await this.supabase
      .from('assessments')
      .select('id')
      .eq('tenant_id', tenantId.value)
      .eq('care_recipient_id', recipientId.value)
      .eq('status', 'finalized')
      .order('conducted_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new RepositoryError(error.message);
    if (!data) return null;
    return this.findById(new AssessmentId(data.id), tenantId);
  }

  async save(assessment: Assessment): Promise<void> {
    const payload = AssessmentMapper.toPersistence(assessment);

    const { error } = await this.supabase.rpc('save_assessment', {
      p_payload: payload as unknown as Database['public']['Functions']['save_assessment']['Args']['p_payload'],
    });

    if (error) {
      if (error.message.includes('version_conflict')) {
        throw new OptimisticLockError();
      }
      throw new RepositoryError(error.message);
    }
  }

  private async hydrateMany(rows: AssessmentRow[]): Promise<Assessment[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const { data: issueRows, error } = await this.supabase
      .from('assessment_issues')
      .select('*')
      .in('assessment_id', ids);
    if (error) throw new RepositoryError(error.message);

    const byAssessment = new Map<string, AssessmentIssueRow[]>();
    for (const row of issueRows ?? []) {
      const arr = byAssessment.get(row.assessment_id) ?? [];
      arr.push(row);
      byAssessment.set(row.assessment_id, arr);
    }

    return rows.map((r) =>
      AssessmentMapper.toDomain({ assessment: r, issues: byAssessment.get(r.id) ?? [] }),
    );
  }
}
