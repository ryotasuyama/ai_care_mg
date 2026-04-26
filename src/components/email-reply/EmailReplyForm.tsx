'use client';

import { useState, useTransition } from 'react';
import {
  draftEmailReplyAction,
  type DraftEmailReplyActionResult,
} from '@/app/email-reply/actions';
import type { PiiCategory } from '@/domain/ai-support/masking/PiiPlaceholder';

const PII_CATEGORY_LABELS: Record<PiiCategory, string> = {
  recipient_name: '利用者名',
  family_name: '家族名',
  phone: '電話番号',
  address: '住所',
  postal_code: '郵便番号',
  birth_date: '生年月日',
  email: 'メールアドレス',
  facility_name: '施設名',
  caregiver_name: 'ケアマネ名',
};

export function EmailReplyForm() {
  const [actionResult, setActionResult] = useState<DraftEmailReplyActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setActionResult(null);
      setCopied(false);
      const res = await draftEmailReplyAction(formData);
      setActionResult(res);
    });
  }

  function handleClear() {
    setActionResult(null);
    setCopied(false);
  }

  async function handleCopy() {
    if (!actionResult?.result) return;
    const { subject, body } = actionResult.result;
    await navigator.clipboard.writeText(`件名: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const result = actionResult?.result;
  const error = actionResult?.error;
  const stats = result?.maskingStats;

  return (
    <div className="mt-6 space-y-6">
      <form action={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="incomingEmailBody" className="block text-sm font-medium text-gray-700">
            受信メール本文 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="incomingEmailBody"
            name="incomingEmailBody"
            rows={8}
            required
            maxLength={5000}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="返信したいメールの本文をここに貼り付けてください"
          />
        </div>

        <div>
          <label htmlFor="intent" className="block text-sm font-medium text-gray-700">
            返信の方向性（任意）
          </label>
          <input
            id="intent"
            name="intent"
            type="text"
            maxLength={200}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="例: 丁寧に日程調整を提案"
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? '生成中...' : 'ドラフト生成'}
          </button>
          {actionResult && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              クリア
            </button>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {stats && stats.totalPlaceholders > 0 && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
              <p className="font-medium">マスキング検出: {stats.totalPlaceholders} 件</p>
              <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                {(Object.entries(stats.byCategory) as [PiiCategory, number][]).map(
                  ([cat, count]) => (
                    <li key={cat}>
                      {PII_CATEGORY_LABELS[cat] ?? cat}: {count}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">返信ドラフト</h2>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? 'コピーしました' : '件名+本文をコピー'}
              </button>
            </div>

            <div className="mb-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">件名</p>
              <p className="mt-1 text-sm text-gray-900">{result.subject}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">本文</p>
              <pre className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{result.body}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
