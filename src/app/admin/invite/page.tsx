import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { redirect } from 'next/navigation';
import { InviteForm } from './InviteForm';

export const metadata = { title: 'ユーザー招待 — ケアマネAI' };

export default async function InvitePage() {
  const auth = await getCurrentAuth();
  if (auth.role !== 'admin') redirect('/care-recipients');

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">ユーザー招待</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <InviteForm />
      </div>
    </div>
  );
}
