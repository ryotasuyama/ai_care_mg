import type { IKnowledgeDocumentRepository } from '@/domain/knowledge/document/IKnowledgeDocumentRepository';
import type { IKnowledgeStorageService } from '@/domain/knowledge/document/IKnowledgeStorageService';

export interface CleanupOrphanedStorageOutput {
  scanned: number;
  deleted: number;
  errors: string[];
}

export class CleanupOrphanedStorageUseCase {
  constructor(
    private readonly repo: IKnowledgeDocumentRepository,
    private readonly storage: IKnowledgeStorageService,
  ) {}

  async execute(): Promise<CleanupOrphanedStorageOutput> {
    const [storagePaths, dbPaths] = await Promise.all([
      this.storage.listAllPaths(),
      this.repo.findAllStoragePaths(),
    ]);

    const orphans: string[] = [];
    for (const path of storagePaths) {
      if (!dbPaths.has(path)) orphans.push(path);
    }

    let deleted = 0;
    const errors: string[] = [];
    for (const path of orphans) {
      try {
        await this.storage.delete(path);
        deleted++;
      } catch (error) {
        errors.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return { scanned: storagePaths.size, deleted, errors };
  }
}
