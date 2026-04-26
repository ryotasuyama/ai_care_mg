import Link from 'next/link';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';

export async function AppHeader() {
  let isAuthenticated = false;
  let userInitial = '';

  try {
    const auth = await getCurrentAuth();
    isAuthenticated = true;
    userInitial = auth.userId.charAt(0).toUpperCase();
  } catch {
    // unauthenticated — show minimal header
  }

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-gray-200 bg-white">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-4">
        <div className="flex items-center gap-6">
          <Link
            href={isAuthenticated ? '/care-recipients' : '/login'}
            className="text-lg font-semibold text-blue-600 hover:text-blue-700"
          >
            ケアマネAI
          </Link>

          {isAuthenticated && (
            <nav className="hidden items-center gap-1 sm:flex">
              <Link
                href="/care-recipients"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                利用者一覧
              </Link>
              <Link
                href="/assessments"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                アセスメント一覧
              </Link>
            </nav>
          )}
        </div>

        {isAuthenticated && (
          <div className="flex items-center gap-3">
            {/* Mobile nav links */}
            <nav className="flex items-center gap-1 sm:hidden">
              <Link
                href="/care-recipients"
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                利用者
              </Link>
              <Link
                href="/assessments"
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                アセスメント
              </Link>
            </nav>

            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
              {userInitial || 'U'}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
