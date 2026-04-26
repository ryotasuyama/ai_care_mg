'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  isAdmin: boolean;
}

export function KnowledgeUploadForm({ isAdmin }: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<'personal' | 'shared'>('personal');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [piiAck, setPiiAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }
    if (scope === 'personal' && !piiAck) {
      setError('個人ナレッジ登録時は PII 注意事項の確認が必要です');
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('scope', scope);
      if (title.trim()) fd.set('title', title.trim());

      const res = await fetch('/api/knowledge/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'アップロードに失敗しました' }));
        setError(body.error ?? 'アップロードに失敗しました');
        return;
      }
      setTitle('');
      setFile(null);
      setPiiAck(false);
      router.refresh();
    });
  };

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-medium text-gray-900">ナレッジを登録</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">スコープ</span>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as 'personal' | 'shared')}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          >
            <option value="personal">個人ナレッジ</option>
            {isAdmin && <option value="shared">共有ナレッジ</option>}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-gray-700">タイトル (任意)</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ファイル名を使用する場合は空欄でOK"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block font-medium text-gray-700">ファイル (PDF / DOCX / TXT, 20MB 以下)</span>
        <input
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm"
        />
        {file && (
          <span className="mt-1 block text-xs text-gray-500">
            {file.name} ({Math.round(file.size / 1024)} KB)
          </span>
        )}
      </label>

      {scope === 'personal' && (
        <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm">
          <p className="font-medium text-yellow-900">個人ナレッジを登録する前にご確認ください</p>
          <p className="mt-1 text-yellow-800">
            利用者氏名・住所・電話番号などの PII (個人識別情報) が含まれていないことを必ず確認してください。
            技術的な完全マスキングは行われません。
          </p>
          <label className="mt-2 flex items-start gap-2">
            <input
              type="checkbox"
              checked={piiAck}
              onChange={(e) => setPiiAck(e.target.checked)}
              className="mt-1"
            />
            <span className="text-yellow-900">PII が含まれていないことを確認しました</span>
          </label>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending || !file}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
        >
          {pending ? 'アップロード中...' : 'アップロード'}
        </button>
      </div>
    </form>
  );
}
