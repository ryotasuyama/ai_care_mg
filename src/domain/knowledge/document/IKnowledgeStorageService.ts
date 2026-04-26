export interface KnowledgeStorageUploadInput {
  path: string;
  buffer: Buffer | Uint8Array;
  contentType: string;
}

export interface KnowledgeStorageUploadResult {
  url: string;
  storagePath: string;
}

export interface IKnowledgeStorageService {
  upload(input: KnowledgeStorageUploadInput): Promise<KnowledgeStorageUploadResult>;
  download(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
  /** すべての保存先パスを返す (オーファン掃除用) */
  listAllPaths(): Promise<Set<string>>;
}
