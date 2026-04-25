import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import type {
  AssessmentDraft,
  AssessmentDraftPayload,
  IAssessmentDraftRepository,
} from '@/domain/care-management/assessment/IAssessmentDraftRepository';
import { ASSESSMENT_DRAFT_TTL_MS } from '@/domain/care-management/assessment/IAssessmentDraftRepository';
import { MaskingResult } from '@/domain/ai-support/masking/MaskingResult';
import { PiiPlaceholder, type PiiCategory } from '@/domain/ai-support/masking/PiiPlaceholder';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { CareRecipientId } from '@/domain/care-management/care-recipient/CareRecipientId';

interface PersistedPlaceholder {
  token: string;
  originalValue: string;
  category: PiiCategory;
}

export class SupabaseAssessmentDraftRepository implements IAssessmentDraftRepository {
  constructor(private readonly supabase: SupabaseClient<Database>) {}

  async saveTemporary(payload: AssessmentDraftPayload): Promise<string> {
    const placeholderJson: PersistedPlaceholder[] = payload.maskingResult.placeholders.map((p) => ({
      token: p.token,
      originalValue: p.originalValue,
      category: p.category,
    }));

    const { data, error } = await this.supabase
      .from('assessment_drafts')
      .insert({
        tenant_id: payload.tenantId.value,
        care_recipient_id: payload.careRecipientId.value,
        original_text: payload.maskingResult.originalText,
        masked_text: payload.maskingResult.maskedText,
        placeholder_map: placeholderJson as unknown as Json,
        created_by: payload.createdBy.value,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to save assessment draft: ${error?.message}`);
    }
    return data.id;
  }

  async findById(draftId: string, tenantId: TenantId): Promise<AssessmentDraft | null> {
    const { data, error } = await this.supabase
      .from('assessment_drafts')
      .select('*')
      .eq('id', draftId)
      .eq('tenant_id', tenantId.value)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch assessment draft: ${error.message}`);
    if (!data) return null;

    const createdAt = new Date(data.created_at);
    if (Date.now() - createdAt.getTime() > ASSESSMENT_DRAFT_TTL_MS) {
      // TTL 失効。NOT_FOUND と同義に扱う
      return null;
    }

    const placeholderEntries = parsePlaceholderJson(data.placeholder_map);
    const placeholders = placeholderEntries.map((e) =>
      PiiPlaceholder.reconstruct(e.category, e.token, e.originalValue),
    );

    const maskingResult = MaskingResult.create({
      originalText: data.original_text,
      maskedText: data.masked_text,
      placeholders,
    });

    return {
      id: data.id,
      tenantId: new TenantId(data.tenant_id),
      careRecipientId: new CareRecipientId(data.care_recipient_id),
      maskingResult,
      createdBy: new UserId(data.created_by),
      createdAt,
    };
  }

  async delete(draftId: string, tenantId: TenantId): Promise<void> {
    const { error } = await this.supabase
      .from('assessment_drafts')
      .delete()
      .eq('id', draftId)
      .eq('tenant_id', tenantId.value);
    if (error) throw new Error(`Failed to delete assessment draft: ${error.message}`);
  }
}

function parsePlaceholderJson(json: Json): PersistedPlaceholder[] {
  if (!Array.isArray(json)) return [];
  const result: PersistedPlaceholder[] = [];
  for (const e of json) {
    if (typeof e !== 'object' || e === null || Array.isArray(e)) continue;
    const obj = e as Record<string, Json>;
    const token = typeof obj.token === 'string' ? obj.token : '';
    const originalValue = typeof obj.originalValue === 'string' ? obj.originalValue : '';
    const category = typeof obj.category === 'string' ? (obj.category as PiiCategory) : null;
    if (token && originalValue && category) {
      result.push({ token, originalValue, category });
    }
  }
  return result;
}
