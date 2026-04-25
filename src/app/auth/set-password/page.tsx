import { SetPasswordForm } from './SetPasswordForm';

export const metadata = { title: 'パスワード設定 — ケアマネAI' };

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-2 text-xl font-semibold text-gray-900">パスワード設定</h1>
        <p className="mb-6 text-sm text-gray-500">初回ログイン用のパスワードを設定してください</p>
        <SetPasswordForm />
      </div>
    </main>
  );
}
