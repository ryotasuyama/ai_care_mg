import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/infrastructure/supabase/server';
import { SupabaseCareRecipientRepository } from '@/infrastructure/repositories/SupabaseCareRecipientRepository';
import { SupabaseAiGenerationLogRepository } from '@/infrastructure/repositories/SupabaseAiGenerationLogRepository';
import { SupabaseAssessmentRepository } from '@/infrastructure/repositories/SupabaseAssessmentRepository';
import { SupabaseAssessmentDraftRepository } from '@/infrastructure/repositories/SupabaseAssessmentDraftRepository';
import { SupabaseKnowledgeDocumentRepository } from '@/infrastructure/repositories/SupabaseKnowledgeDocumentRepository';
import { SupabaseKnowledgeSearchService } from '@/infrastructure/repositories/SupabaseKnowledgeSearchService';
import { SupabaseKnowledgeStorageService } from '@/infrastructure/storage/SupabaseKnowledgeStorageService';
import { SupabaseCarePlanRepository } from '@/infrastructure/repositories/SupabaseCarePlanRepository';
import { DefaultTextExtractor } from '@/infrastructure/knowledge/DefaultTextExtractor';
import { SimpleTextChunker } from '@/infrastructure/knowledge/SimpleTextChunker';
import { RegisterCareRecipientUseCase } from '@/application/care-management/care-recipient/RegisterCareRecipientUseCase';
import { UpdateCareRecipientUseCase } from '@/application/care-management/care-recipient/UpdateCareRecipientUseCase';
import { GetCareRecipientUseCase } from '@/application/care-management/care-recipient/GetCareRecipientUseCase';
import { ListCareRecipientsUseCase } from '@/application/care-management/care-recipient/ListCareRecipientsUseCase';
import { DeleteCareRecipientUseCase } from '@/application/care-management/care-recipient/DeleteCareRecipientUseCase';
import { PrepareAssessmentDraftUseCase } from '@/application/care-management/assessment/PrepareAssessmentDraftUseCase';
import { GenerateAssessmentFromMaskedTextUseCase } from '@/application/care-management/assessment/GenerateAssessmentFromMaskedTextUseCase';
import { GetAssessmentForViewUseCase } from '@/application/care-management/assessment/GetAssessmentForViewUseCase';
import { ListAssessmentsUseCase } from '@/application/care-management/assessment/ListAssessmentsUseCase';
import { FinalizeAssessmentUseCase } from '@/application/care-management/assessment/FinalizeAssessmentUseCase';
import { AddAssessmentIssueUseCase } from '@/application/care-management/assessment/AddAssessmentIssueUseCase';
import { UpdateAssessmentIssueUseCase } from '@/application/care-management/assessment/UpdateAssessmentIssueUseCase';
import { RemoveAssessmentIssueUseCase } from '@/application/care-management/assessment/RemoveAssessmentIssueUseCase';
import { UploadKnowledgeDocumentUseCase } from '@/application/knowledge/UploadKnowledgeDocumentUseCase';
import { ListKnowledgeDocumentsUseCase } from '@/application/knowledge/ListKnowledgeDocumentsUseCase';
import { DeleteKnowledgeDocumentUseCase } from '@/application/knowledge/DeleteKnowledgeDocumentUseCase';
import { ProcessKnowledgeEmbeddingsUseCase } from '@/application/knowledge/ProcessKnowledgeEmbeddingsUseCase';
import { CleanupOrphanedStorageUseCase } from '@/application/knowledge/CleanupOrphanedStorageUseCase';
import { GenerateCarePlanDraftUseCase } from '@/application/care-management/care-plan/GenerateCarePlanDraftUseCase';
import { CreateCarePlanFromDraftUseCase } from '@/application/care-management/care-plan/CreateCarePlanFromDraftUseCase';
import { GetCarePlanForViewUseCase } from '@/application/care-management/care-plan/GetCarePlanForViewUseCase';
import { ListCarePlansUseCase } from '@/application/care-management/care-plan/ListCarePlansUseCase';
import { UpdateCarePlanUseCase } from '@/application/care-management/care-plan/UpdateCarePlanUseCase';
import { FinalizeCarePlanUseCase } from '@/application/care-management/care-plan/FinalizeCarePlanUseCase';
import { ArchiveCarePlanUseCase } from '@/application/care-management/care-plan/ArchiveCarePlanUseCase';
import { CreateSuccessorCarePlanUseCase } from '@/application/care-management/care-plan/CreateSuccessorCarePlanUseCase';
import { GeminiClient } from '@/infrastructure/ai/GeminiClient';
import { GeminiAiSummarizationService } from '@/infrastructure/ai/GeminiAiSummarizationService';
import { GeminiCarePlanGenerationService } from '@/infrastructure/ai/GeminiCarePlanGenerationService';
import { GeminiEmailReplyDraftService } from '@/infrastructure/ai/GeminiEmailReplyDraftService';
import { GeminiEmbeddingService } from '@/infrastructure/ai/GeminiEmbeddingService';
import { StructuredPiiMaskingService } from '@/infrastructure/ai/masking/StructuredPiiMaskingService';
import { DraftEmailReplyUseCase } from '@/application/communication/DraftEmailReplyUseCase';
import { config } from '@/config';

export async function buildContainer() {
  const supabase = await createSupabaseServerClient();
  const careRecipientRepo = new SupabaseCareRecipientRepository(supabase);
  const aiGenerationLogRepo = new SupabaseAiGenerationLogRepository(supabase);
  const assessmentRepo = new SupabaseAssessmentRepository(supabase);
  const assessmentDraftRepo = new SupabaseAssessmentDraftRepository(supabase);
  const knowledgeDocumentRepo = new SupabaseKnowledgeDocumentRepository(supabase);
  const knowledgeStorage = new SupabaseKnowledgeStorageService(supabase);
  const carePlanRepo = new SupabaseCarePlanRepository(supabase);

  const geminiClient = new GeminiClient(config.gemini.apiKey);

  const aiSummarizationService = new GeminiAiSummarizationService(geminiClient);
  const carePlanGenerationService = new GeminiCarePlanGenerationService(geminiClient);
  const emailReplyDraftService = new GeminiEmailReplyDraftService(geminiClient);
  const embeddingService = new GeminiEmbeddingService(geminiClient);
  const piiMaskingService = new StructuredPiiMaskingService();
  const knowledgeSearchService = new SupabaseKnowledgeSearchService(supabase, embeddingService);

  return {
    careRecipientRepo,
    aiGenerationLogRepo,
    assessmentRepo,
    assessmentDraftRepo,
    knowledgeDocumentRepo,
    knowledgeStorage,
    knowledgeSearchService,
    carePlanRepo,
    aiSummarizationService,
    carePlanGenerationService,
    emailReplyDraftService,
    embeddingService,
    piiMaskingService,
    registerCareRecipientUseCase: new RegisterCareRecipientUseCase(careRecipientRepo),
    updateCareRecipientUseCase: new UpdateCareRecipientUseCase(careRecipientRepo),
    getCareRecipientUseCase: new GetCareRecipientUseCase(careRecipientRepo),
    listCareRecipientsUseCase: new ListCareRecipientsUseCase(careRecipientRepo),
    deleteCareRecipientUseCase: new DeleteCareRecipientUseCase(careRecipientRepo),
    prepareAssessmentDraftUseCase: new PrepareAssessmentDraftUseCase(
      careRecipientRepo,
      piiMaskingService,
      assessmentDraftRepo,
    ),
    generateAssessmentFromMaskedTextUseCase: new GenerateAssessmentFromMaskedTextUseCase(
      assessmentDraftRepo,
      assessmentRepo,
      aiSummarizationService,
      aiGenerationLogRepo,
    ),
    getAssessmentForViewUseCase: new GetAssessmentForViewUseCase(assessmentRepo),
    listAssessmentsUseCase: new ListAssessmentsUseCase(assessmentRepo, careRecipientRepo),
    finalizeAssessmentUseCase: new FinalizeAssessmentUseCase(assessmentRepo),
    addAssessmentIssueUseCase: new AddAssessmentIssueUseCase(assessmentRepo),
    updateAssessmentIssueUseCase: new UpdateAssessmentIssueUseCase(assessmentRepo),
    removeAssessmentIssueUseCase: new RemoveAssessmentIssueUseCase(assessmentRepo),
    uploadKnowledgeDocumentUseCase: new UploadKnowledgeDocumentUseCase(
      knowledgeDocumentRepo,
      knowledgeStorage,
    ),
    listKnowledgeDocumentsUseCase: new ListKnowledgeDocumentsUseCase(knowledgeDocumentRepo),
    deleteKnowledgeDocumentUseCase: new DeleteKnowledgeDocumentUseCase(
      knowledgeDocumentRepo,
      knowledgeStorage,
    ),
    generateCarePlanDraftUseCase: new GenerateCarePlanDraftUseCase(
      assessmentRepo,
      careRecipientRepo,
      knowledgeSearchService,
      piiMaskingService,
      carePlanGenerationService,
      aiGenerationLogRepo,
    ),
    createCarePlanFromDraftUseCase: new CreateCarePlanFromDraftUseCase(
      assessmentRepo,
      carePlanRepo,
    ),
    getCarePlanForViewUseCase: new GetCarePlanForViewUseCase(carePlanRepo),
    listCarePlansUseCase: new ListCarePlansUseCase(carePlanRepo),
    updateCarePlanUseCase: new UpdateCarePlanUseCase(carePlanRepo),
    finalizeCarePlanUseCase: new FinalizeCarePlanUseCase(carePlanRepo),
    archiveCarePlanUseCase: new ArchiveCarePlanUseCase(carePlanRepo),
    createSuccessorCarePlanUseCase: new CreateSuccessorCarePlanUseCase(carePlanRepo),
    draftEmailReplyUseCase: new DraftEmailReplyUseCase(
      careRecipientRepo,
      piiMaskingService,
      emailReplyDraftService,
      aiGenerationLogRepo,
    ),
  };
}

/**
 * バックグラウンドジョブ用 (RLS バイパス)。Cron ルートから呼び出す。
 */
export function buildJobContainer() {
  const adminClient = createSupabaseServiceRoleClient();
  const knowledgeDocumentRepo = new SupabaseKnowledgeDocumentRepository(adminClient, adminClient);
  const knowledgeStorage = new SupabaseKnowledgeStorageService(adminClient, adminClient);
  const geminiClient = new GeminiClient(config.gemini.apiKey);
  const embeddingService = new GeminiEmbeddingService(geminiClient);
  const extractor = new DefaultTextExtractor();
  const chunker = new SimpleTextChunker();

  return {
    knowledgeDocumentRepo,
    knowledgeStorage,
    embeddingService,
    processKnowledgeEmbeddingsUseCase: new ProcessKnowledgeEmbeddingsUseCase(
      knowledgeDocumentRepo,
      knowledgeStorage,
      extractor,
      chunker,
      embeddingService,
    ),
    cleanupOrphanedStorageUseCase: new CleanupOrphanedStorageUseCase(
      knowledgeDocumentRepo,
      knowledgeStorage,
    ),
  };
}
