'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  KNOWLEDGE_SCOPE_LABELS,
  PROCESSING_STATUS_LABELS,
  type KnowledgeScope,
  type ProcessingStatus,
} from '@/domain/knowledge/document/types';
import { deleteKnowledgeAction } from '@/app/knowledge/actions';

export interface KnowledgeRow {
  id: string;
  title: string;
  scope: KnowledgeScope;
  ownerId: string | null;
  fileType: string;
  fileSizeBytes: number;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  uploadedAt: string;
  readyAt: string | null;
}

interface Props {
  items: KnowledgeRow[];
  currentUserId: string;
  isAdmin: boolean;
}

export function KnowledgeList({ items, currentUserId, isAdmin }: Props) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        ナレッジはまだ登録されていません。
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white shadow-sm">
      {items.map((item) => (
        <Item key={item.id} item={item} currentUserId={currentUserId} isAdmin={isAdmin} />
      ))}
    </ul>
  );
}

function Item({
  item,
  currentUserId,
  isAdmin,
}: {
  item: KnowledgeRow;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const canDelete =
    item.scope === 'shared' ? isAdmin : item.ownerId === currentUserId;

  const onDelete = () => {
    if (!confirm(`「${item.title}」を削除しますか？`)) return;
    startTransition(async () => {
      const result = await deleteKnowledgeAction(item.id);
      if (result?.error) alert(result.error);
      else router.refresh();
    });
  };

  return (
    <li className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium text-gray-900">{item.title}</span>
            <ScopeBadge scope={item.scope} />
            <StatusBadge status={item.processingStatus} />
            <span className="text-xs text-gray-400">{item.fileType.toUpperCase()}</span>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            登録 {new Date(item.uploadedAt).toLocaleString('ja-JP')}
            {' ・ '}
            {Math.round(item.fileSizeBytes / 1024)} KB
            {item.readyAt && (
              <>
                {' ・ 完了 '}
                {new Date(item.readyAt).toLocaleString('ja-JP')}
              </>
            )}
          </div>
          {item.processingError && (
            <p className="mt-2 text-xs text-red-600">処理失敗: {item.processingError}</p>
          )}
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            className="text-xs text-red-600 hover:text-red-700 disabled:text-gray-400"
          >
            削除
          </button>
        )}
      </div>
    </li>
  );
}

function ScopeBadge({ scope }: { scope: KnowledgeScope }) {
  const cls = scope === 'shared' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {KNOWLEDGE_SCOPE_LABELS[scope]}
    </span>
  );
}

function StatusBadge({ status }: { status: ProcessingStatus }) {
  const cls =
    status === 'ready'
      ? 'bg-green-100 text-green-800'
      : status === 'failed'
        ? 'bg-red-100 text-red-800'
        : status === 'processing'
          ? 'bg-yellow-100 text-yellow-800'
          : 'bg-gray-100 text-gray-700';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>
      {PROCESSING_STATUS_LABELS[status]}
    </span>
  );
}
