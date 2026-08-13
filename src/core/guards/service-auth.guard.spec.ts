import { UnauthorizedException } from '@nestjs/common';
import { ServiceAuthGuard } from './service-auth.guard';

describe('ServiceAuthGuard', () => {
  let guard: ServiceAuthGuard;

  const configServiceMock = {
    get: jest.fn((key: string) =>
      key === 'SERVICE_API_KEY' ? 'secreto-compartido' : undefined,
    ),
    getOrThrow: jest.fn((key: string) =>
      key === 'SERVICE_API_KEY' ? 'secreto-compartido' : undefined,
    ),
  };

  const reflectorMock = {
    getAllAndOverride: jest.fn(() => false),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new ServiceAuthGuard(configServiceMock as any, reflectorMock as any);
  });

  function rpcContext(data: any): any {
    return {
      getType: () => 'rpc',
      switchToRpc: () => ({ getData: () => data }),
    };
  }

  it('permite una llamada RPC con serviceKey válido', () => {
    expect(
      guard.canActivate(rpcContext({ serviceKey: 'secreto-compartido' })),
    ).toBe(true);
  });

  it('rechaza una llamada RPC con serviceKey inválido', () => {
    expect(() =>
      guard.canActivate(rpcContext({ serviceKey: 'clave-mala' })),
    ).toThrow(UnauthorizedException);
  });

  it('rechaza una llamada RPC sin serviceKey', () => {
    expect(() =>
      guard.canActivate(rpcContext({ email: 'x@y.com' })),
    ).toThrow(UnauthorizedException);
  });

  it('no exige clave en rutas HTTP no marcadas con @ServiceRoute()', () => {
    const ctx = {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: {} }) }),
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('exige la clave en rutas HTTP marcadas con @ServiceRoute()', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const ctx = {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-service-key': 'secreto-compartido' } }),
      }),
    };
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('rechaza la clave inválida en rutas HTTP marcadas', () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const ctx = {
      getType: () => 'http',
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-service-key': 'clave-mala' } }),
      }),
    };
    expect(() => guard.canActivate(ctx)).toThrow(UnauthorizedException);
  });
});
