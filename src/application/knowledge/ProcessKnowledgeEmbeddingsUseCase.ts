import type { IKnowledgeDocumentRepository } from '@/domain/knowledge/document/IKnowledgeDocumentRepository';
import type { IKnowledgeStorageService } from '@/domain/knowledge/document/IKnowledgeStorageService';
import type { IEmbeddingService } from '@/domain/ai-support/IEmbeddingService';
import { KnowledgeChunk } from '@/domain/knowledge/document/KnowledgeChunk';
import { EmbeddingVector } from '@/domain/knowledge/document/EmbeddingVector';
import type { ITextExtractor } from '@/infrastructure/knowledge/ITextExtractor';
import type { ITextChunker } from '@/infrastructure/knowledge/ITextChunker';

export interface ProcessKnowledgeEmbeddingsInput {
  batchSize: number;
  /** Vercel タイムアウト前に切り上げる残り余裕 (ms) */
  timeoutMarginMs: number;
  /** スタックジョブ救済の閾値 (ms)。デフォルト 5 分 */
  stuckThresholdMs?: number;
  /** Vercel 関数全体タイムアウト (ms)。デフォルト 60 秒 */
  totalBudgetMs?: number;
}

export interface ProcessKnowledgeEmbeddingsOutput {
  rescued: number;
  processed: string[];
  failed: Array<{ id: string; reason: string }>;
}

export class ProcessKnowledgeEmbeddingsUseCase {
  constructor(
    private readonly documentRepo: IKnowledgeDocumentRepository,
    private readonly storage: IKnowledgeStorageService,
    private readonly extractor: ITextExtractor,
    private readonly chunker: ITextChunker,
    private readonly embeddingService: IEmbeddingService,
  ) {}

  async execute(
    input: ProcessKnowledgeEmbeddingsInput,
  ): Promise<ProcessKnowledgeEmbeddingsOutput> {
    const startedAt = Date.now();
    const totalBudget = input.totalBudgetMs ?? 60_000;
    const stuckThreshold = input.stuckThresholdMs ?? 5 * 60_000;

    // ① スタックジョブ救済 (5 分以上 processing のままの行を pending に戻す)
    const rescued = await this.documentRepo.rescueStuckProcessing(stuckThreshold);

    // ② pending を取得して順次処理
    const pendings = await this.documentRepo.findPendingDocuments(input.batchSize);
    const processed: string[] = [];
    const failed: Array<{ id: string; reason: string }> = [];

    for (const doc of pendings) {
      if (Date.now() - startedAt > totalBudget - input.timeoutMarginMs) break;

      try {
        doc.markAsProcessing();
        await this.documentRepo.save(doc);

        const buffer = await this.storage.download(doc.sourceFile.storagePath);
        const pages = await this.extractor.extract(buffer, doc.sourceFile.type);
        const chunkSpecs = this.chunker.split(pages);
        if (chunkSpecs.length === 0) {
          throw new Error('テキストを抽出できませんでした');
        }

        const chunks: KnowledgeChunk[] = [];
        for (let i = 0; i < chunkSpecs.length; i++) {
          if (Date.now() - startedAt > totalBudget - input.timeoutMarginMs) {
            throw new Error('Vercel タイムアウト接近のため処理を中断しました');
          }
          const spec = chunkSpecs[i]!;
          const embedding = await this.embeddingService.embed(spec.text);
          const vec = EmbeddingVector.create(embedding.values.slice());
          chunks.push(
            KnowledgeChunk.create({
              sequenceNo: i,
              text: spec.text,
              embedding: vec,
              pageNumber: spec.pageNumber,
            }),
          );
        }

        doc.markAsReady(chunks);
        await this.documentRepo.save(doc);
        processed.push(doc.id.value);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        try {
          // 状態が processing じゃない場合 markAsFailed が失敗するので保護
          if (doc.processingStatus === 'pending' || doc.processingStatus === 'processing') {
            doc.markAsFailed(reason);
            await this.documentRepo.save(doc);
          }
        } catch (secondary) {
          console.warn('markAsFailed save failure', secondary);
        }
        failed.push({ id: doc.id.value, reason });
      }
    }

    return { rescued, processed, failed };
  }
}
