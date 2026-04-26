import Link from 'next/link';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { buildContainer } from '@/infrastructure/di/container';
import { CARE_LEVEL_LABELS } from '@/domain/care-management/care-recipient/CareLevel';
import type { CareLevelValue } from '@/domain/care-management/care-recipient/CareLevel';
import { DeleteRecipientButton } from '@/components/care-recipients/DeleteRecipientButton';

export const metadata = { title: '利用者一覧 — ケアマネAI' };

export default async function CareRecipientsPage() {
  const auth = await getCurrentAuth();
  const container = await buildContainer();
  const recipients = await container.listCareRecipientsUseCase.execute({ auth });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">利用者一覧</h1>
        <Link
          href="/care-recipients/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          新規登録
        </Link>
      </div>

      {recipients.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-gray-500">利用者が登録されていません</p>
          <Link href="/care-recipients/new" className="mt-4 inline-block text-blue-600 underline">
            最初の利用者を登録する
          </Link>
        </div>
      ) : (
        <>
          {/* PC: テーブル */}
          <div className="hidden overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm sm:block">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    氏名
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    要介護度
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {recipients.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                      {r.fullName}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                        {CARE_LEVEL_LABELS[r.currentCareLevel as CareLevelValue]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-right text-sm">
                      <div className="flex items-center justify-end gap-4">
                        <Link
                          href={`/care-recipients/${r.id}`}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          詳細
                        </Link>
                        <DeleteRecipientButton id={r.id} fullName={r.fullName} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile: カードリスト */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {recipients.map((r) => (
              <li key={r.id} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white shadow-sm">
                <Link
                  href={`/care-recipients/${r.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <p className="truncate font-medium text-gray-900">{r.fullName}</p>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                      {CARE_LEVEL_LABELS[r.currentCareLevel as CareLevelValue]}
                    </span>
                    <span className="text-sm text-blue-600">›</span>
                  </div>
                </Link>
                <div className="shrink-0 px-3">
                  <DeleteRecipientButton id={r.id} fullName={r.fullName} />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
