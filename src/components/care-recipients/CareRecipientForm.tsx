'use client';

import { useActionState, useState } from 'react';
import {
  CARE_LEVEL_VALUES,
  CARE_LEVEL_LABELS,
} from '@/domain/care-management/care-recipient/CareLevel';
import type { CareLevelValue } from '@/domain/care-management/care-recipient/CareLevel';
import type { FamilyMember } from '@/domain/care-management/care-recipient/CareRecipient';

type ActionResult = { error?: string } | void | null;

interface Props {
  action: (formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  defaultValues?: {
    fullName?: string;
    dateOfBirth?: string;
    address?: string;
    phoneNumber?: string | null;
    currentCareLevel?: CareLevelValue;
    familyMembers?: FamilyMember[];
  };
}

type State = { error?: string } | null;

export function CareRecipientForm({ action, submitLabel, defaultValues }: Props) {
  const wrappedAction = async (_prevState: State, formData: FormData): Promise<State> => {
    const result = await action(formData);
    if (result && typeof result === 'object' && 'error' in result) return result;
    return null;
  };

  const [state, formAction, isPending] = useActionState(wrappedAction, null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>(
    defaultValues?.familyMembers ?? [],
  );

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set('familyMembers', JSON.stringify(familyMembers));
    formAction(fd);
  };

  const addFamilyMember = () => {
    setFamilyMembers((prev) => [...prev, { name: '', relation: '' }]);
  };

  const removeFamilyMember = (i: number) => {
    setFamilyMembers((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateFamilyMember = (i: number, field: keyof FamilyMember, value: string) => {
    setFamilyMembers((prev) =>
      prev.map((fm, idx) => (idx === i ? { ...fm, [field]: value } : fm)),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {state?.error && (
        <p className="rounded bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</p>
      )}

      <Field label="氏名" required>
        <input
          name="fullName"
          required
          defaultValue={defaultValues?.fullName}
          className="field-input"
          placeholder="田中太郎"
        />
      </Field>

      <Field label="生年月日" required>
        <input
          name="dateOfBirth"
          type="date"
          required
          defaultValue={defaultValues?.dateOfBirth}
          className="field-input"
        />
      </Field>

      <Field label="住所" required>
        <input
          name="address"
          required
          defaultValue={defaultValues?.address}
          className="field-input"
          placeholder="東京都新宿区1-1-1"
        />
      </Field>

      <Field label="電話番号">
        <input
          name="phoneNumber"
          type="tel"
          defaultValue={defaultValues?.phoneNumber ?? ''}
          className="field-input"
          placeholder="090-1234-5678"
        />
      </Field>

      <Field label="要介護度" required>
        <select
          name="currentCareLevel"
          required
          defaultValue={defaultValues?.currentCareLevel ?? ''}
          className="field-input"
        >
          <option value="" disabled>
            選択してください
          </option>
          {CARE_LEVEL_VALUES.map((v) => (
            <option key={v} value={v}>
              {CARE_LEVEL_LABELS[v]}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">家族情報</span>
          <button
            type="button"
            onClick={addFamilyMember}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + 追加
          </button>
        </div>
        {familyMembers.map((fm, i) => (
          <div key={i} className="mb-3 rounded-md border border-gray-200 p-3">
            <div className="mb-2 flex justify-between">
              <span className="text-xs text-gray-500">家族 {i + 1}</span>
              <button
                type="button"
                onClick={() => removeFamilyMember(i)}
                className="text-xs text-red-600 hover:text-red-800"
              >
                削除
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input
                placeholder="氏名"
                value={fm.name}
                onChange={(e) => updateFamilyMember(i, 'name', e.target.value)}
                className="field-input text-sm"
              />
              <input
                placeholder="続柄"
                value={fm.relation}
                onChange={(e) => updateFamilyMember(i, 'relation', e.target.value)}
                className="field-input text-sm"
              />
              <input
                placeholder="電話番号（任意）"
                value={fm.phoneNumber ?? ''}
                onChange={(e) => updateFamilyMember(i, 'phoneNumber', e.target.value)}
                className="field-input col-span-2 text-sm"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {isPending ? '送信中...' : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}
