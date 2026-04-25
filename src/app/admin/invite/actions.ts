'use server';

import { getCurrentAuth } from '@/infrastructure/auth/getCurrentAuth';
import { createSupabaseServiceRoleClient } from '@/infrastructure/supabase/server';
import { UseCaseError } from '@/application/shared/UseCaseError';

type InviteResult = { success: boolean; error?: string };

export async function inviteUserAction(formData: FormData): Promise<InviteResult> {
  const auth = await getCurrentAuth();

  if (auth.role !== 'admin') {
    return { success: false, error: '管理者権限が必要です' };
  }

  const email = formData.get('email') as string;
  const role = formData.get('role') as 'care_manager' | 'admin';
  const displayName = formData.get('displayName') as string;

  if (!email || !role) {
    return { success: false, error: 'メールアドレスとロールは必須です' };
  }

  try {
    const adminClient = createSupabaseServiceRoleClient();
    const { error } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        tenant_id: auth.tenantId,
        role,
        display_name: displayName || email.split('@')[0],
      },
    });

    if (error) {
      return { success: false, error: `招待に失敗しました: ${error.message}` };
    }

    return { success: true };
  } catch (error) {
    if (error instanceof UseCaseError) {
      return { success: false, error: error.message };
    }
    return { success: false, error: '予期しないエラーが発生しました' };
  }
}
