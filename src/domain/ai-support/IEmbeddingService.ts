import type { EmbeddingVector } from './types';

export interface IEmbeddingService {
  embed(text: string): Promise<EmbeddingVector>;
}
