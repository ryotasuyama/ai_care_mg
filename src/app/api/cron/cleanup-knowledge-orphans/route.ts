import { NextResponse } from 'next/server';
import { buildJobContainer } from '@/infrastructure/di/container';
import { config } from '@/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const auth = request.headers.get('authorization');
  if (!config.cron.secret || auth !== `Bearer ${config.cron.secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const container = buildJobContainer();
  const result = await container.cleanupOrphanedStorageUseCase.execute();

  return NextResponse.json(result);
}
