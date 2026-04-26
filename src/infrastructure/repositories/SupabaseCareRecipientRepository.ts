import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { ICareRecipientRepository, KnownPiiSet } from '@/domain/care-management/care-recipient/ICareRecipientRepository';
import { CareRecipient, type FamilyMember } from '@/domain/care-management/care-recipient/CareRecipient';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';
import { TenantId } from '@/domain/shared/TenantId';
import { CareRecipientMapper } from './mappers/CareRecipientMapper';

export class SupabaseCareRecipientRepository implements ICareRecipientRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async findById(id: CareRecipientId, tenantId: TenantId): Promise<CareRecipient | null> {
    const { data, error } = await this.supabase
      .from('care_recipients')
      .select('*')
      .eq('id', id.value)
      .eq('tenant_id', tenantId.value)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // not found
      throw new Error(`Failed to fetch care recipient: ${error.message}`);
    }
    return CareRecipientMapper.toDomain(data);
  }

  async findAll(tenantId: TenantId): Promise<CareRecipient[]> {
    const { data, error } = await this.supabase
      .from('care_recipients')
      .select('*')
      .eq('tenant_id', tenantId.value)
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch care recipients: ${error.message}`);
    return (data ?? []).map(CareRecipientMapper.toDomain);
  }

  async save(careRecipient: CareRecipient): Promise<void> {
    const existing = await this.supabase
      .from('care_recipients')
      .select('id')
      .eq('id', careRecipient.id.value)
      .single();

    if (existing.data) {
      const { error } = await this.supabase
        .from('care_recipients')
        .update(CareRecipientMapper.toUpdateRow(careRecipient))
        .eq('id', careRecipient.id.value)
        .eq('tenant_id', careRecipient.tenantId.value);
      if (error) throw new Error(`Failed to update care recipient: ${error.message}`);
    } else {
      const { error } = await this.supabase
        .from('care_recipients')
        .insert(CareRecipientMapper.toInsertRow(careRecipient));
      if (error) throw new Error(`Failed to insert care recipient: ${error.message}`);
    }
  }

  async delete(id: CareRecipientId, tenantId: TenantId): Promise<void> {
    const { error } = await this.supabase
      .from('care_recipients')
      .delete()
      .eq('id', id.value)
      .eq('tenant_id', tenantId.value);
    if (error) throw new Error(`Failed to delete care recipient: ${error.message}`);
  }

  async buildKnownPiiSetForTenant(tenantId: TenantId): Promise<KnownPiiSet> {
    const recipients = await this.findAll(tenantId);
    const names: string[] = [];
    const aliases: string[] = [];

    for (const r of recipients) {
      names.push(r.fullName);
      for (const fm of r.familyMembers as FamilyMember[]) {
        names.push(fm.name);
      }
      // 苗字のみをエイリアスとして登録
      const lastName = r.fullName.split(/\s/)[0];
      if (lastName) aliases.push(lastName);
    }

    return { names, aliases };
  }
}
