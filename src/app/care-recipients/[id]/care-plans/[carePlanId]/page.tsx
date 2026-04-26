import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { CARE_PLAN_STATUS_LABELS } from '@/domain/care-management/care-plan/CarePlanStatus';
import { CarePlanEditor } from '@/components/care-plans/CarePlanEditor';

interface Props {
  params: Promise<{ id: string; carePlanId: string }>;
}

export default async function CarePlanDetailPage({ params }: Props) {
  const { id, carePlanId } = await params;
  const auth = await getCurrentAuth();
  const container = await buildContainer();

  let plan;
  try {
    plan = await container.getCarePlanForViewUseCase.execute({ auth, carePlanId });
  } catch (error) {
    if (error instanceof UseCaseError && error.code === 'NOT_FOUND') notFound();
    throw error;
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link
          href={`/care-recipients/${id}/care-plans`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← ケアプラン一覧
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">{plan.planNumber}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              plan.status === 'finalized'
                ? 'bg-green-100 text-green-800'
                : plan.status === 'archived'
                  ? 'bg-gray-100 text-gray-700'
                  : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {CARE_PLAN_STATUS_LABELS[plan.status]}
          </span>
        </div>
      </div>

      <CarePlanEditor recipientId={id} plan={plan} />
    </div>
  );
}
