import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IAiGenerationLogRepository,
  AiGenerationLogRecord,
} from '@/domain/ai-support/IAiGenerationLogRepository';

export class SupabaseAiGenerationLogRepository implements IAiGenerationLogRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async save(record: AiGenerationLogRecord): Promise<void> {
    const { error } = await this.supabase.from('ai_generation_logs').insert({
      tenant_id: record.tenantId.value,
      kind: record.kind,
      original_text: record.originalText,
      masked_text: record.maskedText,
      placeholder_map: record.placeholderMap,
      masking_stats: record.maskingStats ?? null,
      ai_response: record.aiResponse,
      ai_model: record.aiModel,
      prompt_template_id: record.promptTemplateId,
      related_entity_type: record.relatedEntityType ?? null,
      related_entity_id: record.relatedEntityId ?? null,
      created_by: record.createdBy.value,
      request_tokens: record.requestTokens ?? null,
      response_tokens: record.responseTokens ?? null,
      latency_ms: record.latencyMs ?? null,
    });

    if (error) {
      throw new Error(`Failed to save AI generation log: ${error.message}`);
    }
  }
}
