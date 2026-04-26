import type { TenantId } from '@/domain/shared/TenantId';
import type { KnowledgeDocument } from './KnowledgeDocument';
import type { KnowledgeDocumentId } from './KnowledgeDocumentId';

export interface IKnowledgeDocumentRepository {
  findById(id: KnowledgeDocumentId, tenantId: TenantId): Promise<KnowledgeDocument | null>;

  findAll(tenantId: TenantId): Promise<KnowledgeDocument[]>;

  /** バックグラウンドジョブ用: pending な未処理ドキュメントを N 件取得 (RLS バイパス) */
  findPendingDocuments(batchSize: number): Promise<KnowledgeDocument[]>;

  /** Storage の存在ファイルとの差分用: DB 側の全 storage_path を取得 (RLS バイパス) */
  findAllStoragePaths(): Promise<Set<string>>;

  /** スタックジョブ救済: processing のまま 5 分以上の行を pending に戻す (RLS バイパス) */
  rescueStuckProcessing(thresholdMs: number): Promise<number>;

  save(document: KnowledgeDocument): Promise<void>;

  delete(id: KnowledgeDocumentId, tenantId: TenantId): Promise<void>;
}
