'use server';

import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server';

export async function loginAction(formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return { error: 'メールアドレスとパスワードを入力してください' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: 'メールアドレスまたはパスワードが正しくありません' };
  }

  redirect('/care-recipients');
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/login');
}
