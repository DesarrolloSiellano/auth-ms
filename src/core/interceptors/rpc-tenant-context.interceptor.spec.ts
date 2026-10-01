import { RpcTenantContextInterceptor } from './rpc-tenant-context.interceptor';
import { tenantLocalStorage } from '../database/tenant.context';
import { of } from 'rxjs';

function rpcContext(data: any): any {
  return {
    getType: () => 'rpc',
    switchToRpc: () => ({ getData: () => data }),
  };
}

describe('RpcTenantContextInterceptor', () => {
  const interceptor = new RpcTenantContextInterceptor();

  it('establece contexto desde el tenant del payload', (done) => {
    const ctx = rpcContext({ company: 'EmpresaX', tenantId: 'T-001' });
    interceptor.intercept(ctx, { handle: () => {
      expect(tenantLocalStorage.getStore()).toMatchObject({
        companyId: 'EmpresaX',
        tenantId: 'T-001',
        isSuperAdmin: false,
      });
      done();
      return of(null);
    } } as any);
  });

  it('toma el tenant desde payload.user', (done) => {
    const ctx = rpcContext({ user: { company: 'EmpresaY' } });
    interceptor.intercept(ctx, { handle: () => {
      expect(tenantLocalStorage.getStore()?.companyId).toBe('EmpresaY');
      done();
      return of(null);
    } } as any);
  });

  it('no establece contexto ni superadmin si falta tenant', (done) => {
    const ctx = rpcContext({ serviceKey: 'k' });
    interceptor.intercept(ctx, { handle: () => {
      expect(tenantLocalStorage.getStore()).toBeUndefined();
      done();
      return of(null);
    } } as any);
  });

  it('nunca marca isSuperAdmin desde el payload', (done) => {
    const ctx = rpcContext({ company: 'X', isSuperAdmin: true });
    interceptor.intercept(ctx, { handle: () => {
      expect(tenantLocalStorage.getStore()?.isSuperAdmin).toBe(false);
      done();
      return of(null);
    } } as any);
  });
});
