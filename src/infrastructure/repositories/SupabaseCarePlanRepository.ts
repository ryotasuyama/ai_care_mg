import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ICarePlanRepository } from '@/domain/care-management/care-plan/ICarePlanRepository';
import { CarePlan } from '@/domain/care-management/care-plan/CarePlan';
import { CarePlanId } from '@/domain/care-management/care-plan/CarePlanId';
import type { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import type { TenantId } from '@/domain/shared/TenantId';
import { CarePlanMapper } from './mappers/CarePlanMapper';
import { OptimisticLockError } from '@/domain/shared/errors/OptimisticLockError';
import { RepositoryError } from './SupabaseAssessmentRepository';
import { UseCaseError } from '@/application/shared/UseCaseError';

type PlanRow = Database['public']['Tables']['care_plans']['Row'];
type LtgRow = Database['public']['Tables']['care_plan_long_term_goals']['Row'];
type StgRow = Database['public']['Tables']['care_plan_short_term_goals']['Row'];
type SvcRow = Database['public']['Tables']['care_plan_service_items']['Row'];

function isPlanNumberDuplicateError(message: string): boolean {
  return message.includes('care_plan_number_unique_per_tenant');
}

export class SupabaseCarePlanRepository implements ICarePlanRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: CarePlanId, tenantId: TenantId): Promise<CarePlan | null> {
    const [
      { data: planRow, error: pErr },
      { data: ltgRows, error: lErr },
      { data: stgRows, error: sErr },
      { data: svcRows, error: vErr },
    ] = await Promise.all([
      this.supabase
        .from('care_plans')
        .select('*')
        .eq('id', id.value)
        .eq('tenant_id', tenantId.value)
        .maybeSingle(),
      this.supabase
        .from('care_plan_long_term_goals')
        .select('*')
        .eq('care_plan_id', id.value)
        .eq('tenant_id', tenantId.value),
      this.supabase
        .from('care_plan_short_term_goals')
        .select('*')
        .eq('care_plan_id', id.value)
        .eq('tenant_id', tenantId.value),
      this.supabase
        .from('care_plan_service_items')
        .select('*')
        .eq('care_plan_id', id.value)
        .eq('tenant_id', tenantId.value),
    ]);

    if (pErr) throw new RepositoryError(pErr.message);
    if (lErr) throw new RepositoryError(lErr.message);
    if (sErr) throw new RepositoryError(sErr.message);
    if (vErr) throw new RepositoryError(vErr.message);

    if (!planRow) return null;

    return CarePlanMapper.toDomain({
      plan: planRow,
      longTermGoals: ltgRows ?? [],
      shortTermGoals: stgRows ?? [],
      serviceItems: svcRows ?? [],
    });
  }

  async findByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
  ): Promise<CarePlan[]> {
    const { data, error } = await this.supabase
      .from('care_plans')
      .select('*')
      .eq('tenant_id', tenantId.value)
      .eq('care_recipient_id', recipientId.value)
      .order('plan_period_from', { ascending: false });
    if (error) throw new RepositoryError(error.message);
    return this.hydrateMany(data ?? [], tenantId);
  }

  async findActiveByRecipient(
    recipientId: CareRecipientId,
    tenantId: TenantId,
    today: Date,
  ): Promise<CarePlan | null> {
    const todayIso = today.toISOString().slice(0, 10);
    const { data, error } = await this.supabase
      .from('care_plans')
      .select('id')
      .eq('tenant_id', tenantId.value)
      .eq('care_recipient_id', recipientId.value)
      .eq('status', 'finalized')
      .lte('plan_period_from', todayIso)
      .gte('plan_period_to', todayIso)
      .order('plan_period_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new RepositoryError(error.message);
    if (!data) return null;
    return this.findById(new CarePlanId(data.id), tenantId);
  }

  async save(carePlan: CarePlan): Promise<void> {
    const payload = CarePlanMapper.toPersistence(carePlan);
    const { error } = await this.supabase.rpc('save_care_plan', {
      p_payload: payload as unknown as Database['public']['Functions']['save_care_plan']['Args']['p_payload'],
    });
    if (error) {
      if (error.message.includes('version_conflict')) {
        throw new OptimisticLockError();
      }
      if (isPlanNumberDuplicateError(error.message)) {
        throw new UseCaseError(
          'INVALID_INPUT',
          `プラン番号「${carePlan.planNumber}」は既に使われています。別の番号を入力してください。`,
          error,
        );
      }
      throw new RepositoryError(error.message);
    }
  }

  async saveSuccessor(newPlan: CarePlan, predecessorId: CarePlanId): Promise<void> {
    const payload = CarePlanMapper.toPersistence(newPlan);
    const { error } = await this.supabase.rpc('create_successor_care_plan', {
      p_new_plan: payload as unknown as Database['public']['Functions']['create_successor_care_plan']['Args']['p_new_plan'],
      p_predecessor_id: predecessorId.value,
    });
    if (error) {
      if (error.message.includes('predecessor_not_finalized')) {
        throw new UseCaseError(
          'INVALID_INPUT',
          '後継プランは確定済みプランに対してのみ作成できます',
          error,
        );
      }
      if (isPlanNumberDuplicateError(error.message)) {
        throw new UseCaseError(
          'INVALID_INPUT',
          `プラン番号「${newPlan.planNumber}」は既に使われています。別の番号を入力してください。`,
          error,
        );
      }
      throw new RepositoryError(error.message);
    }
  }

  private async hydrateMany(rows: PlanRow[], tenantId: TenantId): Promise<CarePlan[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);

    const [{ data: ltgRows }, { data: stgRows }, { data: svcRows }] = await Promise.all([
      this.supabase
        .from('care_plan_long_term_goals')
        .select('*')
        .in('care_plan_id', ids)
        .eq('tenant_id', tenantId.value),
      this.supabase
        .from('care_plan_short_term_goals')
        .select('*')
        .in('care_plan_id', ids)
        .eq('tenant_id', tenantId.value),
      this.supabase
        .from('care_plan_service_items')
        .select('*')
        .in('care_plan_id', ids)
        .eq('tenant_id', tenantId.value),
    ]);

    const groupBy = <T extends { care_plan_id: string }>(arr: T[] | null) => {
      const m = new Map<string, T[]>();
      for (const row of arr ?? []) {
        const a = m.get(row.care_plan_id) ?? [];
        a.push(row);
        m.set(row.care_plan_id, a);
      }
      return m;
    };

    const ltgMap = groupBy<LtgRow>(ltgRows);
    const stgMap = groupBy<StgRow>(stgRows);
    const svcMap = groupBy<SvcRow>(svcRows);

    return rows.map((r) =>
      CarePlanMapper.toDomain({
        plan: r,
        longTermGoals: ltgMap.get(r.id) ?? [],
        shortTermGoals: stgMap.get(r.id) ?? [],
        serviceItems: svcMap.get(r.id) ?? [],
      }),
    );
  }
}
