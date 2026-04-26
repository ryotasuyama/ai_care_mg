import { KnowledgeChunkId } from './KnowledgeChunkId';
import { EmbeddingVector } from './EmbeddingVector';
import { KnowledgeValidationError } from './KnowledgeValidationError';

export class KnowledgeChunk {
  private constructor(
    private readonly _id: KnowledgeChunkId,
    private readonly _sequenceNo: number,
    private readonly _text: string,
    private readonly _embedding: EmbeddingVector,
    private readonly _pageNumber: number | null,
  ) {}

  static create(params: {
    sequenceNo: number;
    text: string;
    embedding: EmbeddingVector;
    pageNumber?: number | null;
  }): KnowledgeChunk {
    if (params.text.trim().length === 0) {
      throw new KnowledgeValidationError('チャンクテキストは空にできません');
    }
    if (!Number.isInteger(params.sequenceNo) || params.sequenceNo < 0) {
      throw new KnowledgeValidationError('sequence_no は 0 以上の整数である必要があります');
    }
    return new KnowledgeChunk(
      KnowledgeChunkId.generate(),
      params.sequenceNo,
      params.text,
      params.embedding,
      params.pageNumber ?? null,
    );
  }

  static reconstruct(params: {
    id: KnowledgeChunkId;
    sequenceNo: number;
    text: string;
    embedding: EmbeddingVector;
    pageNumber: number | null;
  }): KnowledgeChunk {
    return new KnowledgeChunk(
      params.id,
      params.sequenceNo,
      params.text,
      params.embedding,
      params.pageNumber,
    );
  }

  get id(): KnowledgeChunkId {
    return this._id;
  }
  get sequenceNo(): number {
    return this._sequenceNo;
  }
  get text(): string {
    return this._text;
  }
  get embedding(): EmbeddingVector {
    return this._embedding;
  }
  get pageNumber(): number | null {
    return this._pageNumber;
  }
}
