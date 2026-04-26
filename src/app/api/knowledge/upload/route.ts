import { NextResponse } from 'next/server';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import {
  KNOWLEDGE_SCOPE_VALUES,
  type KnowledgeScope,
} from '@/domain/knowledge/document/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  let auth;
  try {
    auth = await getCurrentAuth();
  } catch {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'multipart/form-data が必要です' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file が見つかりません' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'ファイルサイズは 20MB 以下にしてください' }, { status: 413 });
  }

  const scopeRaw = formData.get('scope');
  const scope = typeof scopeRaw === 'string' ? scopeRaw : 'personal';
  if (!(KNOWLEDGE_SCOPE_VALUES as readonly string[]).includes(scope)) {
    return NextResponse.json({ error: 'スコープが不正です' }, { status: 400 });
  }
  const titleRaw = formData.get('title');
  const title =
    typeof titleRaw === 'string' && titleRaw.trim().length > 0 ? titleRaw : file.name;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const container = await buildContainer();
  try {
    const result = await container.uploadKnowledgeDocumentUseCase.execute({
      auth,
      scope: scope as KnowledgeScope,
      title,
      uploadedFile: {
        buffer,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof UseCaseError) {
      const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    return NextResponse.json({ error: '予期しないエラーが発生しました' }, { status: 500 });
  }
}
