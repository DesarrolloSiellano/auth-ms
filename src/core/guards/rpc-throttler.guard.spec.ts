import { ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { RpcThrottlerGuard } from './rpc-throttler.guard';

function rpcContext(handlerName: string, data: any): ExecutionContext {
  return {
    getType: () => 'rpc',
    getHandler: () => ({ name: handlerName }),
    switchToRpc: () => ({ getData: () => data }),
  } as any;
}

function httpContext(): ExecutionContext {
  return { getType: () => 'http' } as any;
}

describe('RpcThrottlerGuard', () => {
  const config = { get: jest.fn().mockReturnValue('true') };
  let guard: RpcThrottlerGuard;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    config.get.mockReturnValue('true');
    guard = new RpcThrottlerGuard(config as any);
  });

  afterEach(() => {
    guard.onModuleDestroy();
    jest.useRealTimers();
  });

  it('permite hasta el límite y bloquea al exceder (msLogin=5)', () => {
    const ctx = rpcContext('msLogin', { serviceKey: 'k' });
    for (let i = 0; i < 5; i += 1) {
      expect(guard.canActivate(ctx)).toBe(true);
    }
    expect(() => guard.canActivate(ctx)).toThrow(ThrottlerException);
  });

  it('usa buckets independientes por comando', () => {
    const login = rpcContext('msLogin', { serviceKey: 'k' });
    const refresh = rpcContext('msRefresh', { serviceKey: 'k' });

    for (let i = 0; i < 5; i += 1) guard.canActivate(login);
    expect(() => guard.canActivate(login)).toThrow(ThrottlerException);
    // Otro comando no se ve afectado por el anterior.
    expect(guard.canActivate(refresh)).toBe(true);
  });

  it('usa buckets independientes por serviceKey', () => {
    const a = rpcContext('msLogin', { serviceKey: 'app-a' });
    const b = rpcContext('msLogin', { serviceKey: 'app-b' });

    for (let i = 0; i < 5; i += 1) guard.canActivate(a);
    expect(() => guard.canActivate(a)).toThrow(ThrottlerException);
    expect(guard.canActivate(b)).toBe(true);
  });

  it('reinicia el contador tras la ventana', () => {
    const ctx = rpcContext('msLogin', { serviceKey: 'k' });
    for (let i = 0; i < 5; i += 1) guard.canActivate(ctx);
    expect(() => guard.canActivate(ctx)).toThrow(ThrottlerException);

    jest.setSystemTime(new Date('2026-01-01T00:01:01Z')); // +61s
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('no afecta al canal HTTP', () => {
    const g = new RpcThrottlerGuard(config as any);
    for (let i = 0; i < 50; i += 1) {
      expect(g.canActivate(httpContext())).toBe(true);
    }
    g.onModuleDestroy();
  });

  it('no limita si RPC_THROTTLE_ENABLED=false', () => {
    config.get.mockReturnValue('false');
    const g = new RpcThrottlerGuard(config as any);
    const ctx = rpcContext('msLogin', { serviceKey: 'k' });
    for (let i = 0; i < 10; i += 1) {
      expect(g.canActivate(ctx)).toBe(true);
    }
    g.onModuleDestroy();
  });
});
