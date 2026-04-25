import { createSupabaseServerClient } from '@/infrastructure/supabase/server';
import type { AuthorizationContext } from '@/application/shared/AuthorizationContext';

export class AuthenticationError extends Error {
  constructor(message = 'Not authenticated') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export async function getCurrentAuth(): Promise<AuthorizationContext> {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new AuthenticationError();
  }

  const { data: appUser, error: userError } = await supabase
    .from('app_users')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  if (userError || !appUser) {
    throw new AuthenticationError('User profile not found');
  }

  return {
    userId: user.id,
    tenantId: appUser.tenant_id,
    role: appUser.role,
  };
}
