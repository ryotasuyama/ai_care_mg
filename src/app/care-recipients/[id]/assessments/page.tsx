import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { AssessmentList } from '@/components/assessments/AssessmentList';

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/care-recipients/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← {recipient.fullName}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">
            アセスメント履歴
          </h1>
          <Link
            href={`/care-recipients/${id}/assessments/new`}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            新規作成
          </Link>
        </div>
      </div>
      <AssessmentList items={items} showRecipient={false} />
    </div>
  );
}
