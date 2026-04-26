import Link from 'next/link';
import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import { UserMenu } from './UserMenu';

export async function AppHeader() {
  let isAuthenticated = false;
  let userProfile: { display_name: string; email: string; role: string } | null = null;

  try {
    const auth = await getCurrentAuth();
    isAuthenticated = true;

    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from('app_users')
      .select('display_name, email, role')
      .eq('id', auth.userId)
      .single();
    userProfile = data;
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
              <Link
                href="/knowledge"
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                ナレッジ
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
              <Link
                href="/knowledge"
                className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
              >
                ナレッジ
              </Link>
            </nav>

            <UserMenu
              displayName={userProfile?.display_name ?? ''}
              email={userProfile?.email ?? ''}
              role={userProfile?.role ?? 'care_manager'}
            />
          </div>
        )}
      </div>
    </header>
  );
}
