import type { IUseCase } from '@/application/shared/IUseCase';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { TenantId } from '@/domain/shared/TenantId';
import { UserId } from '@/domain/shared/UserId';
import type { IKnowledgeDocumentRepository } from '@/domain/knowledge/document/IKnowledgeDocumentRepository';
import type { IKnowledgeStorageService } from '@/domain/knowledge/document/IKnowledgeStorageService';
import { KnowledgeDocument } from '@/domain/knowledge/document/KnowledgeDocument';
import { SourceFile } from '@/domain/knowledge/document/SourceFile';
import { KnowledgeValidationError } from '@/domain/knowledge/document/KnowledgeValidationError';
import {
  KNOWLEDGE_SCOPE_VALUES,
  type KnowledgeScope,
  type SourceFileType,
} from '@/domain/knowledge/document/types';

export interface UploadKnowledgeDocumentInput {
  auth: AuthorizationContext;
  scope: KnowledgeScope;
  title: string;
  uploadedFile: {
    buffer: Buffer;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
}

export interface UploadKnowledgeDocumentOutput {
  documentId: string;
}

export class UploadKnowledgeDocumentUseCase
  implements IUseCase<UploadKnowledgeDocumentInput, UploadKnowledgeDocumentOutput>
{
  constructor(
    private readonly documentRepo: IKnowledgeDocumentRepository,
    private readonly storageService: IKnowledgeStorageService,
  ) {}

  async execute(input: UploadKnowledgeDocumentInput): Promise<UploadKnowledgeDocumentOutput> {
    if (!(KNOWLEDGE_SCOPE_VALUES as readonly string[]).includes(input.scope)) {
      throw new UseCaseError('INVALID_INPUT', 'スコープが不正です');
    }
    if (input.title.trim().length === 0) {
      throw new UseCaseError('INVALID_INPUT', 'タイトルは必須です');
    }
    if (input.scope === 'shared' && input.auth.role !== 'admin') {
      throw new UseCaseError('FORBIDDEN', '共有ナレッジは管理者のみ登録できます');
    }

    const tenantId = new TenantId(input.auth.tenantId);
    const userId = new UserId(input.auth.userId);

    const fileType = resolveFileType(input.uploadedFile.fileName, input.uploadedFile.mimeType);

    // ① Storage アップロード (DB に登録する前に実体を置く)
    const storagePath = `${tenantId.value}/${input.scope}/${crypto.randomUUID()}_${sanitizeFilename(
      input.uploadedFile.fileName,
    )}`;

    let url: string;
    try {
      const result = await this.storageService.upload({
        path: storagePath,
        buffer: input.uploadedFile.buffer,
        contentType: input.uploadedFile.mimeType,
      });
      url = result.url;
    } catch (error) {
      throw new UseCaseError(
        'INTERNAL_ERROR',
        `アップロードに失敗しました: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    // ② 集約生成
    let document: KnowledgeDocument;
    try {
      document = KnowledgeDocument.create({
        tenantId,
        scope: input.scope,
        ownerId: input.scope === 'personal' ? userId : null,
        title: input.title,
        sourceFile: SourceFile.create({
          url,
          storagePath,
          type: fileType,
          sizeBytes: input.uploadedFile.sizeBytes,
        }),
        uploadedBy: userId,
      });
    } catch (error) {
      // Storage はアップ済みなので best-effort で消す (オーファン掃除でも回収)
      try {
        await this.storageService.delete(storagePath);
      } catch {
        /* ignore */
      }
      if (error instanceof KnowledgeValidationError) {
        throw new UseCaseError('INVALID_INPUT', error.message, error);
      }
      throw error;
    }

    // ③ DB 登録 (Cron が pending として拾う)
    await this.documentRepo.save(document);

    return { documentId: document.id.value };
  }
}

function resolveFileType(fileName: string, mimeType: string): SourceFileType {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf' || mimeType === 'application/pdf') return 'pdf';
  if (
    ext === 'docx' ||
    mimeType.includes('wordprocessingml') ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return 'docx';
  }
  if (ext === 'txt' || mimeType.startsWith('text/plain')) return 'txt';
  throw new UseCaseError('INVALID_INPUT', `サポートされていないファイル種別: ${fileName}`);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]/g, '_').slice(0, 80);
}
