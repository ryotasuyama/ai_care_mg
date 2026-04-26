'use client';

import { useState, useTransition } from 'react';
import { finalizeAssessmentAction } from '@/app/care-recipients/[id]/assessments/[assessmentId]/actions';

interface Props {
  careRecipientId: string;
  assessmentId: string;
}

export function FinalizeButton({ careRecipientId, assessmentId }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onFinalize = () => {
    setError(null);
    startTransition(async () => {
      const result = await finalizeAssessmentAction(careRecipientId, assessmentId);
      if (result?.error) setError(result.error);
      else setConfirming(false);
    });
  };

  if (confirming) {
    return (
      <div className="rounded-md border border-yellow-300 bg-yellow-50 p-4">
        <p className="mb-3 text-sm text-yellow-900">
          確定すると以降の編集はできなくなります。よろしいですか？
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onFinalize}
            disabled={pending}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {pending ? '処理中...' : '確定する'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
          >
            キャンセル
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700"
    >
      アセスメントを確定
    </button>
  );
}
