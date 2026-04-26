import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { AssessmentStatus } from '@/domain/care-management/assessment/AssessmentStatus';
import { CarePlanDraftView } from '@/components/care-plans/CarePlanDraftView';

interface Props {
  params: Promise<{ id: string; assessmentId: string }>;
}

export default async function CarePlanDraftPage({ params }: Props) {
  const { id, assessmentId } = await params;
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  let recipient;
  try {
    recipient = await container.getCareRecipientUseCase.execute({ auth, id });
  } catch (error) {
    if (error instanceof UseCaseError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  let assessmentView;
  try {
    assessmentView = await container.getAssessmentForViewUseCase.execute({
      auth,
      assessmentId,
    });
  } catch (error) {
    if (error instanceof UseCaseError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  if (assessmentView.status !== AssessmentStatus.Finalized) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Link
          href={`/care-recipients/${id}/assessments/${assessmentId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← アセスメント詳細に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">ケアプランドラフト生成</h1>
        <p className="mt-4 rounded-md border border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          ケアプランドラフトは確定済みアセスメント (Finalized) のみ作成できます。
          先にアセスメントを確定してください。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/care-recipients/${id}/assessments/${assessmentId}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← アセスメント詳細に戻る
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">ケアプランドラフト生成</h1>
      </div>
      <CarePlanDraftView
        recipientId={id}
        assessmentId={assessmentId}
        recipientName={recipient.fullName}
      />
    </div>
  );
}
