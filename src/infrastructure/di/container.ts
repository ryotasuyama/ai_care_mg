import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { SupabaseCareRecipientRepository } from '@/infrastructure/repositories/SupabaseCareRecipientRepository';
import { RegisterCareRecipientUseCase } from '@/application/care-management/care-recipient/RegisterCareRecipientUseCase';
import { UpdateCareRecipientUseCase } from '@/application/care-management/care-recipient/UpdateCareRecipientUseCase';
import { GetCareRecipientUseCase } from '@/application/care-management/care-recipient/GetCareRecipientUseCase';
import { ListCareRecipientsUseCase } from '@/application/care-management/care-recipient/ListCareRecipientsUseCase';

// プレースホルダ: 後続フェーズで実装予定
// IAiSummarizationService
// ICarePlanGenerationService
// IEmbeddingService
// IPiiMaskingService
// IKnowledgeSearchService
// IAiGenerationLogRepository
// ICarePlanRepository
// IAssessmentRepository
// IKnowledgeDocumentRepository

export async function buildContainer() {
  const supabase = await createSupabaseServerClient();
  const careRecipientRepo = new SupabaseCareRecipientRepository(supabase);

  return {
    careRecipientRepo,
    registerCareRecipientUseCase: new RegisterCareRecipientUseCase(careRecipientRepo),
    updateCareRecipientUseCase: new UpdateCareRecipientUseCase(careRecipientRepo),
    getCareRecipientUseCase: new GetCareRecipientUseCase(careRecipientRepo),
    listCareRecipientsUseCase: new ListCareRecipientsUseCase(careRecipientRepo),
  };
}
