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
  const result = await container.processKnowledgeEmbeddingsUseCase.execute({
    batchSize: 3,
    timeoutMarginMs: 10_000,
    totalBudgetMs: 60_000,
  });

  return NextResponse.json({
    rescued: result.rescued,
    processed: result.processed.length,
    failed: result.failed.length,
    failedDetails: result.failed,
  });
}
