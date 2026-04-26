'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: '指定されたデータが見つかりません',
  FORBIDDEN: 'この操作を行う権限がありません',
  INVALID_INPUT: '入力内容を確認してください',
  INCONSISTENT_DATA: 'データの整合性エラーが発生しました',
  CONFLICT: 'データが競合しています。画面を再読み込みしてください',
  INTERNAL_ERROR: 'システムエラーが発生しました',
};

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const sentryId = Sentry.lastEventId();
  const message =
    ERROR_MESSAGES[error.message] ?? 'システムエラーが発生しました。しばらくしてから再試行してください。';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold text-gray-900">エラーが発生しました</h1>
        <p className="mt-3 text-sm text-gray-600">{message}</p>
        {sentryId && (
          <p className="mt-2 text-xs text-gray-400">エラーID: {sentryId}</p>
        )}
        <button
          onClick={reset}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          再試行
        </button>
        <p className="mt-3 text-sm text-gray-500">
          <Link href="/" className="text-blue-600 hover:underline">
            トップページへ
          </Link>
        </p>
      </div>
    </div>
  );
}
