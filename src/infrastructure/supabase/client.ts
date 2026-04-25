'use client';

import { createBrowserClient } from '@supabase/ssr';
import { config } from '@/config';
import type { Database } from '@/types/database';

export function createSupabaseBrowserClient() {
  return createBrowserClient<Database>(config.supabase.url, config.supabase.anonKey);
}
