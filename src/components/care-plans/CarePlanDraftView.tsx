'use client';

import { useState, useTransition } from 'react';
import {
  generateCarePlanDraftAction,
  adoptCarePlanDraftAction,
} from '@/app/care-recipients/[id]/care-plans/draft/[assessmentId]/actions';

interface DraftLongTerm {
  title: string;
  description: string;
  targetPeriodMonths: number;
}
interface DraftShortTerm {
  parentLongTermGoalIndex: number;
  title: string;
  description: string;
  targetPeriodMonths: number;
}
interface DraftServiceItem {
  relatedShortTermGoalIndex: number;
  serviceType: string;
  serviceName: string;
  frequencyText: string;
  remarks?: string;
}
interface DraftCitation {
  knowledgeIndex: number;
  usedFor: string;
}
interface DraftSnippet {
  title: string;
  source: string;
  similarity: number;
}
interface Draft {
  longTermGoals: DraftLongTerm[];
  shortTermGoals: DraftShortTerm[];
  serviceItemCandidates: DraftServiceItem[];
  citations: DraftCitation[];
  knowledgeSnippets: DraftSnippet[];
  assessmentSummaryUnmasked: string;
}

interface Props {
  recipientId: string;
  assessmentId: string;
  recipientName: string;
}

export function CarePlanDraftView({ recipientId, assessmentId, recipientName }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 採用時パラメータ
  const today = new Date().toISOString().slice(0, 10);
  const sixMonthsLater = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().slice(0, 10);
  })();

  const [planNumber, setPlanNumber] = useState(() => {
    const now = new Date();
    const yyyyMm = now.toISOString().slice(0, 7);
    const hhmmss = now.toTimeString().slice(0, 8).replace(/:/g, '');
    return `CP-${yyyyMm}-${recipientId.slice(0, 4)}-${hhmmss}`;
  });
  const [planFrom, setPlanFrom] = useState(today);
  const [planTo, setPlanTo] = useState(sixMonthsLater);

  const onGenerate = () => {
    setError(null);
    startTransition(async () => {
      const result = await generateCarePlanDraftAction(assessmentId);
      if (result.error) setError(result.error);
      else if (result.draft) setDraft(result.draft);
    });
  };

  const onAdopt = () => {
    if (!draft) return;
    setError(null);

    const longTermGoals = draft.longTermGoals.map((g) => ({
      title: g.title,
      description: g.description,
      targetPeriodFrom: planFrom,
      targetPeriodTo: addMonthsIso(planFrom, g.targetPeriodMonths),
    }));
    const shortTermGoals = draft.shortTermGoals.map((g) => ({
      parentLongTermGoalIndex: g.parentLongTermGoalIndex,
      title: g.title,
      description: g.description,
      targetPeriodFrom: planFrom,
      targetPeriodTo: addMonthsIso(planFrom, g.targetPeriodMonths),
    }));
    const serviceItems = draft.serviceItemCandidates.map((s) => ({
      relatedShortTermGoalIndex: s.relatedShortTermGoalIndex,
      serviceType: s.serviceType,
      serviceName: s.serviceName,
      frequencyText: s.frequencyText,
      remarks: s.remarks ?? null,
    }));

    startTransition(async () => {
      const result = await adoptCarePlanDraftAction({
        recipientId,
        assessmentId,
        planNumber,
        planPeriodFrom: planFrom,
        planPeriodTo: planTo,
        longTermGoals,
        shortTermGoals,
        serviceItems,
      });
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">
          {recipientName} さんのケアプランドラフト
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          確定済みアセスメントとナレッジベースを根拠に、AI がドラフトを生成します。
        </p>
        {!draft && (
          <button
            type="button"
            onClick={onGenerate}
            disabled={pending}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
          >
            {pending ? 'AI 生成中...' : 'ドラフトを生成'}
          </button>
        )}
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {draft && (
        <>
          <Section title="アセスメント要約 (アンマスク)">
            <p className="whitespace-pre-wrap text-sm text-gray-800">
              {draft.assessmentSummaryUnmasked}
            </p>
          </Section>

          <Section title={`長期目標 (${draft.longTermGoals.length})`}>
            <ul className="space-y-2">
              {draft.longTermGoals.map((g, i) => (
                <li key={i} className="rounded-md border border-gray-200 p-3">
                  <p className="font-medium">
                    #{i + 1} {g.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{g.description}</p>
                  <p className="mt-1 text-xs text-gray-500">{g.targetPeriodMonths}ヶ月</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`短期目標 (${draft.shortTermGoals.length})`}>
            <ul className="space-y-2">
              {draft.shortTermGoals.map((g, i) => (
                <li key={i} className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">
                    親長期目標 #{g.parentLongTermGoalIndex + 1}
                  </p>
                  <p className="font-medium">
                    #{i + 1} {g.title}
                  </p>
                  <p className="mt-1 text-sm text-gray-700">{g.description}</p>
                  <p className="mt-1 text-xs text-gray-500">{g.targetPeriodMonths}ヶ月</p>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={`サービス候補 (${draft.serviceItemCandidates.length})`}>
            <ul className="space-y-2">
              {draft.serviceItemCandidates.map((s, i) => (
                <li key={i} className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs text-gray-500">
                    関連短期目標 #{s.relatedShortTermGoalIndex + 1}
                  </p>
                  <p className="font-medium">
                    {s.serviceType}: {s.serviceName}
                  </p>
                  <p className="text-sm text-gray-700">{s.frequencyText}</p>
                  {s.remarks && <p className="text-xs text-gray-500">{s.remarks}</p>}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="参照ナレッジ">
            {draft.knowledgeSnippets.length === 0 ? (
              <p className="text-sm text-gray-500">該当するナレッジは見つかりませんでした。</p>
            ) : (
              <ul className="space-y-1 text-sm text-gray-700">
                {draft.knowledgeSnippets.map((k, i) => (
                  <li key={i} className="rounded-md bg-gray-50 px-3 py-2">
                    <span className="font-mono text-xs text-blue-600">[{i + 1}]</span> {k.source}{' '}
                    <span className="text-xs text-gray-400">
                      (類似度 {k.similarity.toFixed(2)})
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {draft.citations.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-gray-500">
                {draft.citations.map((c, i) => (
                  <li key={i}>
                    [{c.knowledgeIndex + 1}] {c.usedFor}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="text-sm font-medium text-gray-700">採用してケアプランを作成</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">プラン番号</span>
                <input
                  value={planNumber}
                  onChange={(e) => setPlanNumber(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">計画期間 開始</span>
                <input
                  type="date"
                  value={planFrom}
                  onChange={(e) => setPlanFrom(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">計画期間 終了</span>
                <input
                  type="date"
                  value={planTo}
                  onChange={(e) => setPlanTo(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                破棄
              </button>
              <button
                type="button"
                onClick={onAdopt}
                disabled={pending}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-300"
              >
                {pending ? '保存中...' : '採用してケアプランを作成'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-gray-700">{title}</h3>
      {children}
    </section>
  );
}

function addMonthsIso(fromIso: string, months: number): string {
  const d = new Date(fromIso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
