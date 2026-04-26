'use client';

import { deleteCareRecipientAction } from '@/app/care-recipients/actions';

interface Props {
  id: string;
  fullName: string;
}

export function DeleteRecipientButton({ id, fullName }: Props) {
  async function handleClick() {
    if (!window.confirm(`「${fullName}」を削除しますか？\nこの操作は元に戻せません。`)) return;
    await deleteCareRecipientAction(id);
  }

  return (
    <button
      onClick={handleClick}
      className="text-red-600 hover:text-red-800"
    >
      削除
    </button>
  );
}
