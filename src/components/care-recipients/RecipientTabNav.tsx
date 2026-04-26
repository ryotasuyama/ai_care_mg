'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface Props {
  recipientId: string;
}

const tabs = [
  { label: '概要', href: (id: string) => `/care-recipients/${id}` },
  { label: 'アセスメント', href: (id: string) => `/care-recipients/${id}/assessments` },
  { label: 'ケアプラン', href: (id: string) => `/care-recipients/${id}/care-plans` },
];

export function RecipientTabNav({ recipientId }: Props) {
  const pathname = usePathname();

  return (
    <div className="overflow-x-auto border-b border-gray-200">
      <nav className="flex whitespace-nowrap">
        {tabs.map((tab) => {
          const href = tab.href(recipientId);
          const isActive = pathname === href;

          return (
            <Link
              key={tab.label}
              href={href}
              className={[
                'border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              ].join(' ')}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
