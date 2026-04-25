'use client';

import { useActionState } from 'react';
import { inviteUserAction } from './actions';

type State = { success: boolean; error?: string } | null;

async function inviteWithPrevState(_prevState: State, formData: FormData): Promise<State> {
  return inviteUserAction(formData);
}

export function InviteForm() {
  const [state, formAction, isPending] = useActionState(inviteWithPrevState, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state?.error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded bg-green-50 px-4 py-3 text-sm text-green-700">
          招待メールを送信しました
        </p>
      )}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">メールアドレス</label>
        <input name="email" type="email" required className="field-input" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">表示名</label>
        <input name="displayName" className="field-input" placeholder="任意" />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-700">ロール</label>
        <select name="role" required className="field-input">
          <option value="care_manager">ケアマネジャー</option>
          <option value="admin">管理者</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? '送信中...' : '招待する'}
      </button>
    </form>
  );
}
