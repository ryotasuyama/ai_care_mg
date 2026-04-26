'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  finalizeCarePlanAction,
  archiveCarePlanAction,
  updateCarePlanAction,
  createSuccessorCarePlanAction,
} from '@/app/care-recipients/[id]/care-plans/[carePlanId]/actions';
import type { CarePlanViewDto } from '@/application/care-management/care-plan/dto/CarePlanViewDto';

interface Props {
  recipientId: string;
  plan: CarePlanViewDto;
}

interface EditableLong {
  id?: string;
  title: string;
  description: string;
  targetPeriodFrom: string;
  targetPeriodTo: string;
}
interface EditableShort {
  id?: string;
  parentLongTermGoalIndex: number;
  title: string;
  description: string;
  targetPeriodFrom: string;
  targetPeriodTo: string;
}
interface EditableService {
  id?: string;
  relatedShortTermGoalIndex: number | null;
  serviceType: string;
  serviceName: string;
  frequencyText: string;
  frequencyPerWeek: number | null;
  providerName: string;
  remarks: string;
}

export function CarePlanEditor({ recipientId, plan }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = plan.status === 'draft';

  const [longs, setLongs] = useState<EditableLong[]>(
    plan.longTermGoals.map((g) => ({
      id: g.id,
      title: g.title,
      description: g.description ?? '',
      targetPeriodFrom: g.targetPeriodFrom,
      targetPeriodTo: g.targetPeriodTo,
    })),
  );

  const longIndexById = (id: string) => longs.findIndex((l) => l.id === id);

  const [shorts, setShorts] = useState<EditableShort[]>(
    plan.shortTermGoals.map((g) => ({
      id: g.id,
      parentLongTermGoalIndex: Math.max(0, longIndexById(g.parentLongTermGoalId)),
      title: g.title,
      description: g.description ?? '',
      targetPeriodFrom: g.targetPeriodFrom,
      targetPeriodTo: g.targetPeriodTo,
    })),
  );

  const shortIndexById = (id: string) => shorts.findIndex((s) => s.id === id);

  const [services, setServices] = useState<EditableService[]>(
    plan.serviceItems.map((s) => ({
      id: s.id,
      relatedShortTermGoalIndex: s.relatedShortTermGoalId
        ? shortIndexById(s.relatedShortTermGoalId)
        : null,
      serviceType: s.serviceType,
      serviceName: s.serviceName,
      frequencyText: s.frequencyText ?? '',
      frequencyPerWeek: s.frequencyPerWeek ?? null,
      providerName: s.providerName ?? '',
      remarks: s.remarks ?? '',
    })),
  );

  const onSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateCarePlanAction(recipientId, {
        carePlanId: plan.id,
        longTermGoals: longs.map((l) => ({
          id: l.id,
          title: l.title,
          description: l.description.trim() === '' ? null : l.description,
          targetPeriodFrom: l.targetPeriodFrom,
          targetPeriodTo: l.targetPeriodTo,
        })),
        shortTermGoals: shorts.map((s) => ({
          id: s.id,
          parentLongTermGoalIndex: s.parentLongTermGoalIndex,
          title: s.title,
          description: s.description.trim() === '' ? null : s.description,
          targetPeriodFrom: s.targetPeriodFrom,
          targetPeriodTo: s.targetPeriodTo,
        })),
        serviceItems: services.map((sv) => ({
          id: sv.id,
          relatedShortTermGoalIndex: sv.relatedShortTermGoalIndex,
          serviceType: sv.serviceType,
          serviceName: sv.serviceName,
          frequencyText: sv.frequencyText.trim() === '' ? null : sv.frequencyText,
          frequencyPerWeek: sv.frequencyPerWeek,
          providerName: sv.providerName.trim() === '' ? null : sv.providerName,
          remarks: sv.remarks.trim() === '' ? null : sv.remarks,
        })),
      });
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  const onFinalize = () => {
    if (!confirm('ケアプランを確定しますか？確定後は編集できません。')) return;
    startTransition(async () => {
      const result = await finalizeCarePlanAction(recipientId, plan.id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  const onArchive = () => {
    if (!confirm('ケアプランをアーカイブしますか？')) return;
    startTransition(async () => {
      const result = await archiveCarePlanAction(recipientId, plan.id);
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-700">
          プラン番号: <span className="font-medium">{plan.planNumber}</span>
        </p>
        <p className="text-sm text-gray-700">
          計画期間: {plan.planPeriodFrom} 〜 {plan.planPeriodTo}
        </p>
        <p className="text-sm text-gray-700">version: {plan.version}</p>
      </div>

      <Section title="長期目標">
        {longs.map((g, i) => (
          <div key={g.id ?? i} className="rounded-md border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">#{i + 1}</span>
              {editable && longs.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setLongs((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-red-600"
                >
                  削除
                </button>
              )}
            </div>
            <input
              value={g.title}
              onChange={(e) =>
                setLongs((prev) => updateAt(prev, i, { title: e.target.value }))
              }
              disabled={!editable}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
            <textarea
              value={g.description}
              onChange={(e) =>
                setLongs((prev) => updateAt(prev, i, { description: e.target.value }))
              }
              disabled={!editable}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <DateInput
                label="開始"
                value={g.targetPeriodFrom}
                disabled={!editable}
                onChange={(v) =>
                  setLongs((prev) => updateAt(prev, i, { targetPeriodFrom: v }))
                }
              />
              <DateInput
                label="終了"
                value={g.targetPeriodTo}
                disabled={!editable}
                onChange={(v) =>
                  setLongs((prev) => updateAt(prev, i, { targetPeriodTo: v }))
                }
              />
            </div>
          </div>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() =>
              setLongs((prev) => [
                ...prev,
                {
                  title: '',
                  description: '',
                  targetPeriodFrom: plan.planPeriodFrom,
                  targetPeriodTo: plan.planPeriodTo,
                },
              ])
            }
            className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            + 長期目標を追加
          </button>
        )}
      </Section>

      <Section title="短期目標">
        {shorts.map((s, i) => (
          <div key={s.id ?? i} className="rounded-md border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">#{i + 1}</span>
              {editable && shorts.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setShorts((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-red-600"
                >
                  削除
                </button>
              )}
            </div>
            <select
              value={s.parentLongTermGoalIndex}
              onChange={(e) =>
                setShorts((prev) =>
                  updateAt(prev, i, {
                    parentLongTermGoalIndex: Number(e.target.value),
                  }),
                )
              }
              disabled={!editable}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            >
              {longs.map((l, idx) => (
                <option key={idx} value={idx}>
                  親長期目標 #{idx + 1}: {l.title || '(無題)'}
                </option>
              ))}
            </select>
            <input
              value={s.title}
              onChange={(e) =>
                setShorts((prev) => updateAt(prev, i, { title: e.target.value }))
              }
              disabled={!editable}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
            <textarea
              value={s.description}
              onChange={(e) =>
                setShorts((prev) => updateAt(prev, i, { description: e.target.value }))
              }
              disabled={!editable}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <DateInput
                label="開始"
                value={s.targetPeriodFrom}
                disabled={!editable}
                onChange={(v) =>
                  setShorts((prev) => updateAt(prev, i, { targetPeriodFrom: v }))
                }
              />
              <DateInput
                label="終了"
                value={s.targetPeriodTo}
                disabled={!editable}
                onChange={(v) =>
                  setShorts((prev) => updateAt(prev, i, { targetPeriodTo: v }))
                }
              />
            </div>
          </div>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() =>
              setShorts((prev) => [
                ...prev,
                {
                  parentLongTermGoalIndex: 0,
                  title: '',
                  description: '',
                  targetPeriodFrom: plan.planPeriodFrom,
                  targetPeriodTo: plan.planPeriodTo,
                },
              ])
            }
            className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            + 短期目標を追加
          </button>
        )}
      </Section>

      <Section title={`サービス内容 (${services.length})`}>
        {services.map((sv, i) => (
          <div key={sv.id ?? i} className="rounded-md border border-gray-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">#{i + 1}</span>
              {editable && (
                <button
                  type="button"
                  onClick={() =>
                    setServices((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  className="text-xs text-red-600"
                >
                  削除
                </button>
              )}
            </div>
            <select
              value={sv.relatedShortTermGoalIndex ?? ''}
              onChange={(e) =>
                setServices((prev) =>
                  updateAt(prev, i, {
                    relatedShortTermGoalIndex:
                      e.target.value === '' ? null : Number(e.target.value),
                  }),
                )
              }
              disabled={!editable}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            >
              <option value="">(関連短期目標なし)</option>
              {shorts.map((s, idx) => (
                <option key={idx} value={idx}>
                  #{idx + 1}: {s.title || '(無題)'}
                </option>
              ))}
            </select>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                value={sv.serviceType}
                onChange={(e) =>
                  setServices((prev) => updateAt(prev, i, { serviceType: e.target.value }))
                }
                placeholder="サービス種別 (例: 通所介護)"
                disabled={!editable}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
              />
              <input
                value={sv.serviceName}
                onChange={(e) =>
                  setServices((prev) => updateAt(prev, i, { serviceName: e.target.value }))
                }
                placeholder="サービス名 (例: デイサービスA)"
                disabled={!editable}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
              />
            </div>
            <input
              value={sv.frequencyText}
              onChange={(e) =>
                setServices((prev) => updateAt(prev, i, { frequencyText: e.target.value }))
              }
              placeholder="頻度 (例: 週3回)"
              disabled={!editable}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
            <input
              value={sv.providerName}
              onChange={(e) =>
                setServices((prev) => updateAt(prev, i, { providerName: e.target.value }))
              }
              placeholder="事業者名 (任意)"
              disabled={!editable}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
            <textarea
              value={sv.remarks}
              onChange={(e) =>
                setServices((prev) => updateAt(prev, i, { remarks: e.target.value }))
              }
              placeholder="備考"
              disabled={!editable}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
            />
          </div>
        ))}
        {editable && (
          <button
            type="button"
            onClick={() =>
              setServices((prev) => [
                ...prev,
                {
                  relatedShortTermGoalIndex: shorts.length > 0 ? 0 : null,
                  serviceType: '',
                  serviceName: '',
                  frequencyText: '',
                  frequencyPerWeek: null,
                  providerName: '',
                  remarks: '',
                },
              ])
            }
            className="rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            + サービスを追加
          </button>
        )}
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        {editable && (
          <>
            <button
              type="button"
              onClick={onSave}
              disabled={pending}
              className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:bg-gray-200"
            >
              {pending ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              onClick={onFinalize}
              disabled={pending || services.length === 0}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:bg-gray-300"
            >
              ケアプランを確定
            </button>
          </>
        )}
        {plan.status === 'finalized' && (
          <>
            <SuccessorTrigger recipientId={recipientId} carePlanId={plan.id} planTo={plan.planPeriodTo} />
            <button
              type="button"
              onClick={onArchive}
              disabled={pending}
              className="rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 disabled:bg-gray-200"
            >
              アーカイブ
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function SuccessorTrigger({
  recipientId,
  carePlanId,
  planTo,
}: {
  recipientId: string;
  carePlanId: string;
  planTo: string;
}) {
  const [open, setOpen] = useState(false);
  const [newPlanNumber, setNewPlanNumber] = useState('');
  const [newFrom, setNewFrom] = useState(addDaysIso(planTo, 1));
  const [newTo, setNewTo] = useState(addMonthsIso(addDaysIso(planTo, 1), 6));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onCreate = () => {
    setError(null);
    startTransition(async () => {
      const result = await createSuccessorCarePlanAction(recipientId, carePlanId, {
        newPlanNumber,
        newPlanPeriodFrom: newFrom,
        newPlanPeriodTo: newTo,
      });
      if (result?.error) setError(result.error);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
      >
        次期プラン作成
      </button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm">
      <p className="font-medium text-blue-900">次期プランの計画期間を入力</p>
      <input
        value={newPlanNumber}
        onChange={(e) => setNewPlanNumber(e.target.value)}
        placeholder="新プラン番号"
        className="w-full rounded-md border border-gray-300 px-3 py-2"
      />
      <div className="grid gap-2 sm:grid-cols-2">
        <DateInput label="開始" value={newFrom} onChange={setNewFrom} />
        <DateInput label="終了" value={newTo} onChange={setNewTo} />
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCreate}
          disabled={pending || !newPlanNumber}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:bg-gray-300"
        >
          作成
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-700 hover:bg-gray-200"
        >
          キャンセル
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function DateInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs text-gray-700">
      <span className="mb-1 block">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-50"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-3 text-sm font-medium text-gray-700">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function updateAt<T>(arr: T[], index: number, patch: Partial<T>): T[] {
  return arr.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonthsIso(iso: string, months: number): string {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
