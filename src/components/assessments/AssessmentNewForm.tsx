'use client';

import { useState, useTransition } from 'react';
import { VoiceInput } from './VoiceInput';
import { prepareAssessmentDraftAction } from '@/app/care-recipients/[id]/assessments/new/actions';

interface Props {
  careRecipientId: string;
}

export function AssessmentNewForm({ careRecipientId }: Props) {
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('voiceTranscript', transcript);
      const result = await prepareAssessmentDraftAction(careRecipientId, formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form
      action={() => onSubmit()}
      className="space-y-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <VoiceInput value={transcript} onChange={setTranscript} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || transcript.trim().length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
        >
          {pending ? '処理中...' : 'マスキング確認へ'}
        </button>
      </div>
    </form>
  );
}
