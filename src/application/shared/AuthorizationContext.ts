export interface AuthorizationContext {
  userId: string;
  tenantId: string;
  role: 'care_manager' | 'admin';
}
