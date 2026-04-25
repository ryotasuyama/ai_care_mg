'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/auth/actions';

type State = { error?: string } | null;

async function loginWithPrevState(_prevState: State, formData: FormData): Promise<State> {
  return loginAction(formData);
}

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginWithPrevState, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-gray-700">
          メールアドレス
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="example@care.jp"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium text-gray-700">
          パスワード
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? 'ログイン中...' : 'ログイン'}
      </button>
    </form>
  );
}
