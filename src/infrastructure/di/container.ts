import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { SupabaseCareRecipientRepository } from '@/infrastructure/repositories/SupabaseCareRecipientRepository';
import { SupabaseAiGenerationLogRepository } from '@/infrastructure/repositories/SupabaseAiGenerationLogRepository';
import { RegisterCareRecipientUseCase } from '@/application/care-management/care-recipient/RegisterCareRecipientUseCase';
import { UpdateCareRecipientUseCase } from '@/application/care-management/care-recipient/UpdateCareRecipientUseCase';
import { GetCareRecipientUseCase } from '@/application/care-management/care-recipient/GetCareRecipientUseCase';
import { ListCareRecipientsUseCase } from '@/application/care-management/care-recipient/ListCareRecipientsUseCase';
import { GeminiClient } from '@/infrastructure/ai/GeminiClient';
import { GeminiAiSummarizationService } from '@/infrastructure/ai/GeminiAiSummarizationService';
import { GeminiCarePlanGenerationService } from '@/infrastructure/ai/GeminiCarePlanGenerationService';
import { GeminiEmailReplyDraftService } from '@/infrastructure/ai/GeminiEmailReplyDraftService';
import { GeminiEmbeddingService } from '@/infrastructure/ai/GeminiEmbeddingService';
import { StructuredPiiMaskingService } from '@/infrastructure/ai/masking/StructuredPiiMaskingService';
import { config } from '@/config';

export async function buildContainer() {
  const supabase = await createSupabaseServerClient();
  const careRecipientRepo = new SupabaseCareRecipientRepository(supabase);
  const aiGenerationLogRepo = new SupabaseAiGenerationLogRepository(supabase);

  const geminiClient = new GeminiClient(config.gemini.apiKey);

  const aiSummarizationService = new GeminiAiSummarizationService(geminiClient);
  const carePlanGenerationService = new GeminiCarePlanGenerationService(geminiClient);
  const emailReplyDraftService = new GeminiEmailReplyDraftService(geminiClient);
  const embeddingService = new GeminiEmbeddingService(geminiClient);
  const piiMaskingService = new StructuredPiiMaskingService();

  return {
    careRecipientRepo,
    aiGenerationLogRepo,
    aiSummarizationService,
    carePlanGenerationService,
    emailReplyDraftService,
    embeddingService,
    piiMaskingService,
    registerCareRecipientUseCase: new RegisterCareRecipientUseCase(careRecipientRepo),
    updateCareRecipientUseCase: new UpdateCareRecipientUseCase(careRecipientRepo),
    getCareRecipientUseCase: new GetCareRecipientUseCase(careRecipientRepo),
    listCareRecipientsUseCase: new ListCareRecipientsUseCase(careRecipientRepo),
  };
}
