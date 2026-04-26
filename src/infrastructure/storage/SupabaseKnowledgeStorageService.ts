import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type {
  IKnowledgeStorageService,
  KnowledgeStorageUploadInput,
  KnowledgeStorageUploadResult,
} from '@/domain/knowledge/document/IKnowledgeStorageService';

export const KNOWLEDGE_BUCKET = 'knowledge';
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 日

export class SupabaseKnowledgeStorageService implements IKnowledgeStorageService {
  /** 通常用クライアント (アップロード時の RLS 認可) */
  /** 管理用クライアント (Cron / オーファン掃除など、RLS バイパス) */
  constructor(
    private readonly supabase: SupabaseClient<Database>,
    private readonly serviceRoleSupabase?: SupabaseClient<Database>,
  ) {}

  private get adminClient(): SupabaseClient<Database> {
    return this.serviceRoleSupabase ?? this.supabase;
  }

  async upload(input: KnowledgeStorageUploadInput): Promise<KnowledgeStorageUploadResult> {
    const client = this.adminClient;
    const { error } = await client.storage
      .from(KNOWLEDGE_BUCKET)
      .upload(input.path, toUploadBody(input.buffer), {
        contentType: input.contentType,
        upsert: false,
      });
    if (error) throw new Error(`Failed to upload knowledge file: ${error.message}`);

    const { data: signed, error: signErr } = await client.storage
      .from(KNOWLEDGE_BUCKET)
      .createSignedUrl(input.path, SIGNED_URL_TTL_SEC);
    if (signErr || !signed) {
      throw new Error(`Failed to generate signed URL: ${signErr?.message}`);
    }

    return { url: signed.signedUrl, storagePath: input.path };
  }

  async download(storagePath: string): Promise<Buffer> {
    const client = this.adminClient;
    const { data, error } = await client.storage.from(KNOWLEDGE_BUCKET).download(storagePath);
    if (error || !data) {
      throw new Error(`Failed to download knowledge file: ${error?.message ?? 'no data'}`);
    }
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async delete(storagePath: string): Promise<void> {
    const client = this.adminClient;
    const { error } = await client.storage.from(KNOWLEDGE_BUCKET).remove([storagePath]);
    if (error) throw new Error(`Failed to delete knowledge file: ${error.message}`);
  }

  async listAllPaths(): Promise<Set<string>> {
    const client = this.adminClient;
    const paths = new Set<string>();
    await collectPathsRecursively(client, '', paths);
    return paths;
  }
}

async function collectPathsRecursively(
  client: SupabaseClient<Database>,
  prefix: string,
  out: Set<string>,
): Promise<void> {
  const { data, error } = await client.storage.from(KNOWLEDGE_BUCKET).list(prefix, {
    limit: 1000,
  });
  if (error) throw new Error(`Failed to list storage paths: ${error.message}`);
  for (const entry of data ?? []) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.id === null) {
      // フォルダ
      await collectPathsRecursively(client, path, out);
    } else {
      out.add(path);
    }
  }
}

function toUploadBody(buffer: Buffer | Uint8Array): Blob | Buffer {
  // Supabase Storage は Buffer / Blob どちらでも受けるが、
  // Vercel ランタイムでは Blob のほうが安定するため Blob に変換。
  if (typeof Blob !== 'undefined') {
    // SharedArrayBuffer 互換の問題を避けるため Uint8Array に正規化してから Blob 化
    const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    return new Blob([view as unknown as BlobPart]);
  }
  return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
}
