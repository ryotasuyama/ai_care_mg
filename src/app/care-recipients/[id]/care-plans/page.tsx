import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { CARE_PLAN_STATUS_LABELS } from '@/domain/care-management/care-plan/CarePlanStatus';
import { RecipientTabNav } from '@/components/care-recipients/RecipientTabNav';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RecipientCarePlansPage({ params }: Props) {
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

  const items = await container.listCarePlansUseCase.execute({ auth, careRecipientId: id });

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
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            ケアプランはまだ作成されていません。確定済みアセスメントから作成できます。
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
            {items.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/care-recipients/${id}/care-plans/${p.id}`}
                  className="block px-6 py-4 hover:bg-gray-50"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{p.planNumber}</p>
                      <p className="text-xs text-gray-500">
                        {p.planPeriodFrom} 〜 {p.planPeriodTo}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'finalized' | 'archived' }) {
  const cls =
    status === 'finalized'
      ? 'bg-green-100 text-green-800'
      : status === 'archived'
        ? 'bg-gray-100 text-gray-700'
        : 'bg-yellow-100 text-yellow-800';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {CARE_PLAN_STATUS_LABELS[status]}
    </span>
  );
}
