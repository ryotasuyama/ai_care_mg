import type { IEmbeddingService } from '@/domain/ai-support/IEmbeddingService';
import { EmbeddingVector } from '@/domain/ai-support/types';
import { GeminiClient } from './GeminiClient';

export class GeminiEmbeddingService implements IEmbeddingService {
  constructor(private readonly gemini: GeminiClient) {}

  async embed(text: string): Promise<EmbeddingVector> {
    const result = await this.gemini.embed({ text, taskType: 'RETRIEVAL_DOCUMENT' });
    return EmbeddingVector.create(result.values);
  }
}
