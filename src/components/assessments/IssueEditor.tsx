'use client';

import { useState, useTransition } from 'react';
import {
  ISSUE_CATEGORY_LABELS,
  ISSUE_CATEGORY_VALUES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_PRIORITY_VALUES,
  type IssueCategory,
  type IssuePriority,
} from '@/domain/care-management/assessment/IssueCategory';
import {
  addAssessmentIssueAction,
  updateAssessmentIssueAction,
  removeAssessmentIssueAction,
} from '@/app/care-recipients/[id]/assessments/[assessmentId]/actions';

export interface IssueRow {
  id: string;
  sequenceNo: number;
  category: IssueCategory;
  description: string;
  priority: IssuePriority;
}

interface Props {
  careRecipientId: string;
  assessmentId: string;
  issues: IssueRow[];
  editable: boolean;
}

export function IssueEditor({ careRecipientId, assessmentId, issues, editable }: Props) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {issues.map((issue) => (
          <IssueItem
            key={issue.id}
            careRecipientId={careRecipientId}
            assessmentId={assessmentId}
            issue={issue}
            editable={editable && issues.length > 0}
            canRemove={editable && issues.length > 1}
            onError={setError}
          />
        ))}
      </ul>

      {editable && (
        <NewIssueForm
          careRecipientId={careRecipientId}
          assessmentId={assessmentId}
          onError={setError}
        />
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function IssueItem({
  careRecipientId,
  assessmentId,
  issue,
  editable,
  canRemove,
  onError,
}: {
  careRecipientId: string;
  assessmentId: string;
  issue: IssueRow;
  editable: boolean;
  canRemove: boolean;
  onError: (msg: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(issue.category);
  const [priority, setPriority] = useState(issue.priority);
  const [description, setDescription] = useState(issue.description);
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    onError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('category', category);
      fd.set('priority', priority);
      fd.set('description', description);
      const result = await updateAssessmentIssueAction(
        careRecipientId,
        assessmentId,
        issue.id,
        fd,
      );
      if (result?.error) onError(result.error);
      else setEditing(false);
    });
  };

  const onRemove = () => {
    if (!confirm('この課題を削除しますか？')) return;
    onError(null);
    startTransition(async () => {
      const result = await removeAssessmentIssueAction(careRecipientId, assessmentId, issue.id);
      if (result?.error) onError(result.error);
    });
  };

  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
          #{issue.sequenceNo}
        </span>
        <PriorityBadge priority={issue.priority} />
        <span>{ISSUE_CATEGORY_LABELS[issue.category]}</span>
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IssueCategory)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {ISSUE_CATEGORY_VALUES.map((c) => (
                <option key={c} value={c}>
                  {ISSUE_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as IssuePriority)}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
            >
              {ISSUE_PRIORITY_VALUES.map((p) => (
                <option key={p} value={p}>
                  優先度: {ISSUE_PRIORITY_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={pending || description.trim().length === 0}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setCategory(issue.category);
                setPriority(issue.priority);
                setDescription(issue.description);
              }}
              className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="whitespace-pre-wrap text-sm text-gray-800">{issue.description}</p>
          {editable && (
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                編集
              </button>
              {canRemove && (
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={pending}
                  className="text-xs text-red-600 hover:text-red-700"
                >
                  削除
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function NewIssueForm({
  careRecipientId,
  assessmentId,
  onError,
}: {
  careRecipientId: string;
  assessmentId: string;
  onError: (msg: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IssueCategory>('health');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [description, setDescription] = useState('');
  const [pending, startTransition] = useTransition();

  const onSave = () => {
    onError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('category', category);
      fd.set('priority', priority);
      fd.set('description', description);
      const result = await addAssessmentIssueAction(careRecipientId, assessmentId, fd);
      if (result?.error) onError(result.error);
      else {
        setDescription('');
        setOpen(false);
      }
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
      >
        + 課題を追加
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as IssueCategory)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        >
          {ISSUE_CATEGORY_VALUES.map((c) => (
            <option key={c} value={c}>
              {ISSUE_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as IssuePriority)}
          className="rounded-md border border-gray-300 px-2 py-1 text-sm"
        >
          {ISSUE_PRIORITY_VALUES.map((p) => (
            <option key={p} value={p}>
              優先度: {ISSUE_PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="課題の説明"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSave}
          disabled={pending || description.trim().length === 0}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          追加
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: IssuePriority }) {
  const cls =
    priority === 'high'
      ? 'bg-red-100 text-red-800'
      : priority === 'medium'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-gray-100 text-gray-700';
  return (
    <span className={`rounded-full px-2 py-0.5 ${cls}`}>
      優先度: {ISSUE_PRIORITY_LABELS[priority]}
    </span>
  );
}
