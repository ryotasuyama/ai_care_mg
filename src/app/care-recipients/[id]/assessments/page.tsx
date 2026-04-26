import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { AssessmentList } from '@/components/assessments/AssessmentList';
import { RecipientTabNav } from '@/components/care-recipients/RecipientTabNav';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipientAssessmentsPage({ params }: Props) {
  const { id } = await params;
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  let recipient;
  try {
    recipient = await container.getCareRecipientUseCase.execute({ auth, id });
  } catch (error) {
    if (error instanceof UseCaseError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  const items = await container.listAssessmentsUseCase.execute({ auth, careRecipientId: id });

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/care-recipients" className="shrink-0 text-sm text-gray-500 hover:text-gray-700">
            ← 一覧
          </Link>
          <h1 className="truncate text-xl font-semibold text-gray-900 sm:text-2xl">
            {recipient.fullName}
          </h1>
        </div>
        <Link
          href={`/care-recipients/${id}/edit`}
          className="shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          編集
        </Link>
      </div>

      {/* Tab navigation */}
      <RecipientTabNav recipientId={id} />

      {/* Content */}
      <div className="mt-6">
        <div className="mb-4 flex justify-end">
          <Link
            href={`/care-recipients/${id}/assessments/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            新規作成
          </Link>
        </div>
        <AssessmentList items={items} showRecipient={false} />
      </div>
    </div>
  );
}
