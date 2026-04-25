import { LoginForm } from './LoginForm';

export const metadata = { title: 'ログイン — ケアマネAI' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-xl font-semibold text-gray-900">ケアマネAI ログイン</h1>
        <LoginForm />
      </div>
    </main>
  );
}
