import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { CareRecipientEditForm } from '@/components/care-recipients/CareRecipientEditForm';
import { updateCareRecipientAction } from '../../actions';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCareRecipientPage({ params }: Props) {
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

  const updateAction = updateCareRecipientAction.bind(null, id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">利用者編集</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <CareRecipientEditForm
          recipient={recipient}
          action={updateAction}
          submitLabel="更新する"
        />
      </div>
    </div>
  );
}
