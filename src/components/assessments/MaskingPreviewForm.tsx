'use client';

import { useState, useTransition } from 'react';
import { generateAssessmentAction } from '@/app/care-recipients/[id]/assessments/new/preview/[draftId]/actions';

interface PlaceholderEntry {
  token: string;
  originalValue: string;
  category: string;
}

interface Props {
  careRecipientId: string;
  draftId: string;
  originalText: string;
  maskedText: string;
  placeholders: PlaceholderEntry[];
  defaultConductedAt: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  recipient_name: '利用者氏名',
  family_name: '家族氏名',
  phone: '電話番号',
  address: '住所',
  postal_code: '郵便番号',
  birth_date: '生年月日',
  email: 'メール',
  facility_name: '施設名',
  caregiver_name: '介護者氏名',
};

export function MaskingPreviewForm({
  careRecipientId,
  draftId,
  originalText,
  maskedText: initialMasked,
  placeholders,
  defaultConductedAt,
}: Props) {
  const [maskedText, setMaskedText] = useState(initialMasked);
  const [type, setType] = useState<'initial' | 'reassessment'>('initial');
  const [conductedAt, setConductedAt] = useState(defaultConductedAt);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = () => {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('maskedText', maskedText);
      formData.set('type', type);
      formData.set('conductedAt', conductedAt);
      const result = await generateAssessmentAction(careRecipientId, draftId, formData);
      if (result?.error) setError(result.error);
    });
  };

  const insertManualMask = () => {
    setMaskedText((prev) => prev + ' {MANUAL_MASK}');
  };

  return (
    <form action={() => onSubmit()} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-medium text-gray-700">原文（送信されません）</h2>
          <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">
            {originalText}
          </pre>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-medium text-blue-700">
            マスク済み（AI に送信される内容）
          </h2>
          <textarea
            value={maskedText}
            onChange={(e) => setMaskedText(e.target.value)}
            rows={Math.max(8, originalText.split('\n').length)}
            className="w-full rounded-md border border-blue-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={insertManualMask}
            className="mt-2 rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          >
            + 手動マスクを挿入
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-medium text-gray-700">
          検出された PII プレースホルダ ({placeholders.length} 件)
        </h2>
        {placeholders.length === 0 ? (
          <p className="text-sm text-gray-500">PII は検出されませんでした。</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {placeholders.map((p) => (
              <li
                key={p.token}
                className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-blue-700">{p.token}</span>
                <span className="text-xs text-gray-500">
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">アセスメント種別</span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as 'initial' | 'reassessment')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="initial">初回</option>
            <option value="reassessment">再アセスメント</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">実施日</span>
          <input
            type="date"
            value={conductedAt}
            onChange={(e) => setConductedAt(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || maskedText.trim().length === 0}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
        >
          {pending ? 'AI 要約中...' : 'この内容で AI 要約'}
        </button>
      </div>
    </form>
  );
}
