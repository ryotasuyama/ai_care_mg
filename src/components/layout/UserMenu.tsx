'use client';

import { useEffect, useRef, useState } from 'react';
import { logoutAction } from '@/app/auth/actions';

const ROLE_LABELS: Record<string, string> = {
  admin: '管理者',
  care_manager: 'ケアマネジャー',
};

interface Props {
  displayName: string;
  email: string;
  role: string;
}

export function UserMenu({ displayName, email, role }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initial = displayName.charAt(0) || 'U';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="ユーザーメニュー"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="font-medium text-gray-900 truncate">{displayName}</p>
            <p className="mt-0.5 text-xs text-gray-500 truncate">{email}</p>
            <p className="mt-0.5 text-xs text-gray-400">{ROLE_LABELS[role] ?? role}</p>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-gray-50"
            >
              ログアウト
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
