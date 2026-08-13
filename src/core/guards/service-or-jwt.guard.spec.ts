import { UnauthorizedException } from '@nestjs/common';
import { of } from 'rxjs';
import { ServiceOrJwtGuard } from './service-or-jwt.guard';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: jest.fn(() =>
    class MockJwtGuard {
      canActivate() {
        return of(true);
      }
    },
  ),
}));

describe('ServiceOrJwtGuard', () => {
  let guard: ServiceOrJwtGuard;

  const configServiceMock = {
    get: jest.fn((key: string) =>
      key === 'SERVICE_API_KEY' ? 'secreto-compartido' : undefined,
    ),
    getOrThrow: jest.fn((key: string) =>
      key === 'SERVICE_API_KEY' ? 'secreto-compartido' : undefined,
    ),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ServiceOrJwtGuard(configServiceMock as any);
  });

  function httpContext(headers: Record<string, any>): any {
    const request = { headers };
    return {
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    };
  }

  it('permite una petición REST con x-service-key válido y marca identidad de servicio', async () => {
    const ctx = httpContext({ 'x-service-key': 'secreto-compartido' });
    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    const req = (ctx).switchToHttp().getRequest();
    expect(req.user.isService).toBe(true);
    expect(req.user.isAdmin).toBe(false);
  });

  it('rechaza una petición REST con x-service-key inválido', async () => {
    const ctx = httpContext({ 'x-service-key': 'clave-mala' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('sin x-service-key delega en el JWT guard (Observable)', async () => {
    const ctx = httpContext({});

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rechaza si SERVICE_API_KEY no está configurada', async () => {
    const noKeyConfig = {
      get: jest.fn(),
      getOrThrow: jest.fn().mockReturnValue(undefined),
    };
    guard = new ServiceOrJwtGuard(noKeyConfig as any);

    const ctx = httpContext({ 'x-service-key': 'cualquiera' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza si la clave difiere en longitud', async () => {
    const ctx = httpContext({ 'x-service-key': 'short' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });

  it('rechaza una clave de la misma longitud pero distinta', async () => {
    const ctx = httpContext({
      'x-service-key': 'X'.repeat('secreto-compartido'.length),
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
  });
});
