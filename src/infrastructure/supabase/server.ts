import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { config } from '@/config';
import type { Database } from '@/types/database';

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(config.supabase.url, config.supabase.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component から呼ばれた場合は無視
        }
      },
    },
  });
}

export function createSupabaseServiceRoleClient() {
  return createClient<Database>(config.supabase.url, config.supabase.serviceRoleKey);
}
