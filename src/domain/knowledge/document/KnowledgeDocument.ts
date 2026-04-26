import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import { IllegalStateTransitionError } from '@/domain/shared/errors/IllegalStateTransitionError';
import { KnowledgeDocumentId } from './KnowledgeDocumentId';
import { KnowledgeChunk } from './KnowledgeChunk';
import { SourceFile } from './SourceFile';
import { KnowledgeValidationError } from './KnowledgeValidationError';
import type { KnowledgeScope, ProcessingStatus } from './types';

export interface KnowledgeDocumentReconstructProps {
  id: KnowledgeDocumentId;
  tenantId: TenantId;
  scope: KnowledgeScope;
  ownerId: UserId | null;
  title: string;
  sourceFile: SourceFile;
  chunks: KnowledgeChunk[];
  processingStatus: ProcessingStatus;
  processingError: string | null;
  uploadedBy: UserId;
  uploadedAt: Date;
  updatedAt: Date;
  readyAt: Date | null;
  version: number;
}

export class KnowledgeDocument {
  private constructor(
    private readonly _id: KnowledgeDocumentId,
    private readonly _tenantId: TenantId,
    private readonly _scope: KnowledgeScope,
    private readonly _ownerId: UserId | null,
    private _title: string,
    private readonly _sourceFile: SourceFile,
    private _chunks: KnowledgeChunk[],
    private _processingStatus: ProcessingStatus,
    private _processingError: string | null,
    private readonly _uploadedBy: UserId,
    private readonly _uploadedAt: Date,
    private _updatedAt: Date,
    private _readyAt: Date | null,
    private _version: number,
  ) {}

  static create(params: {
    tenantId: TenantId;
    scope: KnowledgeScope;
    ownerId: UserId | null;
    title: string;
    sourceFile: SourceFile;
    uploadedBy: UserId;
  }): KnowledgeDocument {
    if (params.title.trim().length === 0) {
      throw new KnowledgeValidationError('タイトルは空にできません');
    }
    if (params.scope === 'personal' && params.ownerId === null) {
      throw new KnowledgeValidationError('個人ナレッジには所有者が必須です');
    }
    if (params.scope === 'shared' && params.ownerId !== null) {
      throw new KnowledgeValidationError('共有ナレッジに所有者を設定してはいけません');
    }
    const now = new Date();
    return new KnowledgeDocument(
      KnowledgeDocumentId.generate(),
      params.tenantId,
      params.scope,
      params.ownerId,
      params.title.trim(),
      params.sourceFile,
      [],
      'pending',
      null,
      params.uploadedBy,
      now,
      now,
      null,
      1,
    );
  }

  static reconstruct(props: KnowledgeDocumentReconstructProps): KnowledgeDocument {
    return new KnowledgeDocument(
      props.id,
      props.tenantId,
      props.scope,
      props.ownerId,
      props.title,
      props.sourceFile,
      [...props.chunks],
      props.processingStatus,
      props.processingError,
      props.uploadedBy,
      props.uploadedAt,
      props.updatedAt,
      props.readyAt,
      props.version,
    );
  }

  markAsProcessing(): void {
    if (this._processingStatus !== 'pending') {
      throw new IllegalStateTransitionError(
        this._processingStatus,
        'processing',
        `pending 状態のみ processing に遷移できます。現在: ${this._processingStatus}`,
      );
    }
    this._processingStatus = 'processing';
    this._updatedAt = new Date();
  }

  markAsReady(chunks: KnowledgeChunk[]): void {
    if (this._processingStatus !== 'processing') {
      throw new IllegalStateTransitionError(
        this._processingStatus,
        'ready',
        `processing 状態のみ ready に遷移できます。現在: ${this._processingStatus}`,
      );
    }
    if (chunks.length === 0) {
      throw new KnowledgeValidationError('ready に遷移するにはチャンクが最低1件必要です');
    }
    const seqs = chunks.map((c) => c.sequenceNo);
    if (new Set(seqs).size !== seqs.length) {
      throw new KnowledgeValidationError('チャンクの sequence_no が重複しています');
    }
    this._chunks = [...chunks];
    this._processingStatus = 'ready';
    const now = new Date();
    this._readyAt = now;
    this._updatedAt = now;
  }

  markAsFailed(reason: string): void {
    if (this._processingStatus !== 'pending' && this._processingStatus !== 'processing') {
      throw new IllegalStateTransitionError(
        this._processingStatus,
        'failed',
        `pending / processing 状態のみ failed に遷移できます。現在: ${this._processingStatus}`,
      );
    }
    this._processingStatus = 'failed';
    this._processingError = reason;
    this._updatedAt = new Date();
  }

  rename(newTitle: string): void {
    if (newTitle.trim().length === 0) {
      throw new KnowledgeValidationError('タイトルは空にできません');
    }
    this._title = newTitle.trim();
    this._updatedAt = new Date();
  }

  canBeAccessedBy(requesterId: UserId, requesterTenantId: TenantId): boolean {
    if (!this._tenantId.equals(requesterTenantId)) return false;
    if (this._scope === 'shared') return true;
    return this._ownerId !== null && this._ownerId.equals(requesterId);
  }

  get id(): KnowledgeDocumentId {
    return this._id;
  }
  get tenantId(): TenantId {
    return this._tenantId;
  }
  get scope(): KnowledgeScope {
    return this._scope;
  }
  get ownerId(): UserId | null {
    return this._ownerId;
  }
  get title(): string {
    return this._title;
  }
  get sourceFile(): SourceFile {
    return this._sourceFile;
  }
  get chunks(): ReadonlyArray<KnowledgeChunk> {
    return this._chunks;
  }
  get processingStatus(): ProcessingStatus {
    return this._processingStatus;
  }
  get processingError(): string | null {
    return this._processingError;
  }
  get uploadedBy(): UserId {
    return this._uploadedBy;
  }
  get uploadedAt(): Date {
    return this._uploadedAt;
  }
  get updatedAt(): Date {
    return this._updatedAt;
  }
  get readyAt(): Date | null {
    return this._readyAt;
  }
  get version(): number {
    return this._version;
  }
}
