import { AsyncLocalStorage } from 'async_hooks';

export interface TenantStore {
  tenantId: string;
  companyId: string;
  isSuperAdmin?: boolean;
}

export const tenantLocalStorage = new AsyncLocalStorage<TenantStore>();
