import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { EmailReplyForm } from '@/components/email-reply/EmailReplyForm';

export const metadata = { title: 'メール返信ドラフト生成 — ケアマネAI' };

export default async function EmailReplyPage() {
  await getCurrentAuth();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">メール返信ドラフト生成</h1>
      <p className="mt-1 text-sm text-gray-500">
        受信メールの本文を貼り付けると、個人情報をマスクした上で返信ドラフトを生成します。
        生成結果を確認してからコピーしてください。送信機能はありません。
      </p>
      <EmailReplyForm />
    </div>
  );
}
