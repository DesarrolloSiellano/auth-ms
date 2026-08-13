import { TenantMiddleware } from './tenant.middleware';
import { tenantLocalStorage } from './tenant.context';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;

  beforeEach(() => {
    middleware = new TenantMiddleware();
  });

  function buildToken(company: string, isSuperAdmin = false): string {
    const payload = Buffer.from(
      JSON.stringify({ company, tenantId: company, isSuperAdmin }),
    ).toString('base64');
    return `header.${payload}.signature`;
  }

  function nextFn(): jest.Mock {
    return jest.fn();
  }

  it('extrae company/tenantId desde el JWT y ejecuta en contexto', () => {
    const req = {
      headers: { authorization: `Bearer ${buildToken('EmpresaX')}` },
    };
    const res = {};
    const next = jest.fn(() => {
      const store = tenantLocalStorage.getStore();
      expect(store).toMatchObject({
        companyId: 'EmpresaX',
        tenantId: 'EmpresaX',
      });
    });

    middleware.use(req as any, res as any, next as any);
    expect(next).toHaveBeenCalled();
  });

  it('marca isSuperAdmin cuando el token lo indica', () => {
    const req = {
      headers: {
        authorization: `Bearer ${buildToken('EmpresaX', true)}`,
      },
    };
    const next = jest.fn(() => {
      const store = tenantLocalStorage.getStore();
      expect(store?.isSuperAdmin).toBe(true);
    });

    middleware.use(req as any, {} as any, next as any);
  });

  it('usa los headers x-company-id/x-tenant-id si no hay JWT', () => {
    const req = {
      headers: { 'x-company-id': 'EmpresaY', 'x-tenant-id': 'T-001' },
    };
    const next = jest.fn(() => {
      const store = tenantLocalStorage.getStore();
      expect(store).toMatchObject({ companyId: 'EmpresaY', tenantId: 'T-001' });
    });

    middleware.use(req as any, {} as any, next as any);
  });

  it('prosigue sin contexto si no hay company', () => {
    const req = { headers: {} };
    const next = nextFn();

    middleware.use(req as any, {} as any, next as any);
    expect(next).toHaveBeenCalled();
  });

  it('ignora un token JWT malformado (sin 3 partes)', () => {
    const req = { headers: { authorization: 'Bearer no-es-jwt' } };
    const next = nextFn();

    middleware.use(req as any, {} as any, next as any);
    expect(next).toHaveBeenCalled();
  });

  it('ignora un token JWT con base64 inválido', () => {
    const req = { headers: { authorization: 'Bearer a.b.c' } };
    const next = nextFn();

    middleware.use(req as any, {} as any, next as any);
    expect(next).toHaveBeenCalled();
  });
});
