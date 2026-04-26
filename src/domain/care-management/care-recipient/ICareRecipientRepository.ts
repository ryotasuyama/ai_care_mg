import { TenantId } from '@/domain/shared/TenantId';
import { CareRecipient } from './CareRecipient';
import { CareRecipientId } from './CareRecipientId';

export interface KnownPiiSet {
  names: string[];
  aliases: string[];
}

export interface ICareRecipientRepository {
  findById(id: CareRecipientId, tenantId: TenantId): Promise<CareRecipient | null>;
  findAll(tenantId: TenantId): Promise<CareRecipient[]>;
  save(careRecipient: CareRecipient): Promise<void>;
  delete(id: CareRecipientId, tenantId: TenantId): Promise<void>;

  /**
   * テナント内の全利用者から KnownPiiSet を構築。
   * マスキング前に呼ぶ。利用者数 < 200 想定のため全件取得で可。
   */
  buildKnownPiiSetForTenant(tenantId: TenantId): Promise<KnownPiiSet>;
}
