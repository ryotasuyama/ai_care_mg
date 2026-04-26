import Link from 'next/link';
import { CareRecipientForm } from '@/components/care-recipients/CareRecipientForm';
import { registerCareRecipientAction } from '../actions';

export const metadata = { title: '利用者登録 — ケアマネAI' };

export default function NewCareRecipientPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Link href="/care-recipients" className="text-sm text-gray-500 hover:text-gray-700">
          ← 利用者一覧
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">利用者登録</h1>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <CareRecipientForm action={registerCareRecipientAction} submitLabel="登録する" />
      </div>
    </div>
  );
}
