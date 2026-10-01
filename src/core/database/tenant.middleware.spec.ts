import { TenantMiddleware } from './tenant.middleware';
import { tenantLocalStorage } from './tenant.context';

describe('TenantMiddleware (deprecado / no-op)', () => {
  let middleware: TenantMiddleware;

  beforeEach(() => {
    middleware = new TenantMiddleware();
  });

  it('no establece contexto y solo continúa', () => {
    const req = {
      headers: {
        authorization: 'Bearer forged.token.value',
        'x-company-id': 'EmpresaX',
        'x-tenant-id': 'T-001',
      },
    };
    const next = jest.fn(() => {
      expect(tenantLocalStorage.getStore()).toBeUndefined();
    });

    middleware.use(req as any, {} as any, next as any);

    expect(next).toHaveBeenCalled();
  });
});
