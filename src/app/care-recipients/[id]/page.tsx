import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { UseCaseError } from '@/application/shared/UseCaseError';
import { CARE_LEVEL_LABELS } from '@/domain/care-management/care-recipient/CareLevel';
import type { CareLevelValue } from '@/domain/care-management/care-recipient/CareLevel';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CareRecipientDetailPage({ params }: Props) {
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
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href="/care-recipients" className="text-sm text-gray-500 hover:text-gray-700">
            ← 一覧
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">{recipient.fullName}</h1>
        </div>
        <Link
          href={`/care-recipients/${id}/edit`}
          className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
        >
          編集
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          <Row label="要介護度">
            <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
              {CARE_LEVEL_LABELS[recipient.currentCareLevel as CareLevelValue]}
            </span>
          </Row>
          <Row label="生年月日">{recipient.dateOfBirth}</Row>
          <Row label="住所">{recipient.address}</Row>
          {recipient.phoneNumber && <Row label="電話番号">{recipient.phoneNumber}</Row>}
        </dl>
      </div>

      {recipient.familyMembers.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-lg font-medium text-gray-900">家族情報</h2>
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {recipient.familyMembers.map((fm, i) => (
              <div key={i} className="flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0">
                <span className="font-medium">{fm.name}</span>
                <span className="text-sm text-gray-500">{fm.relation}</span>
                {fm.phoneNumber && <span className="text-sm text-gray-400">{fm.phoneNumber}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 sm:col-span-2 sm:mt-0">{children}</dd>
    </div>
  );
}
