import { TenantContextInterceptor } from './tenant-context.interceptor';
import { tenantLocalStorage } from '../database/tenant.context';
import { of } from 'rxjs';

function httpContext(user: any): any {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  };
}

describe('TenantContextInterceptor', () => {
  const interceptor = new TenantContextInterceptor();

  it('establece el contexto desde req.user verificado', (done) => {
    const ctx = httpContext({
      company: 'EmpresaX',
      tenantId: 'T-001',
      isSuperAdmin: false,
    });

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

  it('marca isSuperAdmin cuando aplica', (done) => {
    const ctx = httpContext({ company: 'EmpresaX', isSuperAdmin: true });
    interceptor.intercept(ctx, { handle: () => {
      expect(tenantLocalStorage.getStore()?.isSuperAdmin).toBe(true);
      done();
      return of(null);
    } } as any);
  });

  it('no establece contexto si no hay usuario', (done) => {
    const ctx = httpContext(undefined);
    interceptor.intercept(ctx, { handle: () => {
      expect(tenantLocalStorage.getStore()).toBeUndefined();
      done();
      return of(null);
    } } as any);
  });
});
