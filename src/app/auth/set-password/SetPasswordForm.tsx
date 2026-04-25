'use client';

import { useState } from 'react';
import { createSupabaseBrowserClient } from '@/infrastructure/supabase/client';
import { useRouter } from 'next/navigation';

export function SetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isPending, setIsPending] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('パスワードが一致しません');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください');
      return;
    }

    setIsPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    router.push('/care-recipients');
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">新しいパスワード</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="field-input"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">パスワード（確認）</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          className="field-input"
        />
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? '設定中...' : 'パスワードを設定する'}
      </button>
    </form>
  );
}
