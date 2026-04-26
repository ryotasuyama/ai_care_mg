import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { AssessmentNewForm } from '@/components/assessments/AssessmentNewForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function NewAssessmentPage({ params }: Props) {
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/care-recipients/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← {recipient.fullName} に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          アセスメント新規作成
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          訪問記録を音声で入力するか、テキストで直接入力してください。
        </p>
      </div>

      <AssessmentNewForm careRecipientId={id} />
    </div>
  );
}
