import { lastValueFrom, of } from 'rxjs';
import { RpcIdempotencyInterceptor } from './RCPIdempotency.interceptor';
import { RpcException } from '@nestjs/microservices';

describe('RpcIdempotencyInterceptor', () => {
  let interceptor: RpcIdempotencyInterceptor;
  const idempotencyService = {
    findKey: jest.fn(),
    saveKey: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new RpcIdempotencyInterceptor(idempotencyService as any);
  });

  function rpcCtx(data: any, pattern = 'findAll'): any {
    return {
      getType: () => 'rpc',
      switchToRpc: () => ({
        getData: () => data,
        getContext: () => ({ getPattern: () => pattern }),
      }),
    };
  }

  it('deja pasar contextos que no son rpc', async () => {
    const ctx = { getType: () => 'http' };
    const next = { handle: () => of('ok') };
    const result = await interceptor.intercept(ctx as any, next as any);
    await expect(lastValueFrom(result)).resolves.toBe('ok');
  });

  it('deja pasar si no hay idempotencyKey', async () => {
    const next = { handle: () => of('ok') };
    const result = await interceptor.intercept(rpcCtx({}), next as any);
    await expect(lastValueFrom(result)).resolves.toBe('ok');
  });

  it('rechaza una key de formato inválido', async () => {
    const next = { handle: () => of('ok') };
    await expect(
      interceptor.intercept(rpcCtx({ idempotencyKey: 'short' }), next as any),
    ).rejects.toThrow(RpcException);
  });

  it('devuelve la respuesta cacheada si ya se procesó', async () => {
    idempotencyService.findKey.mockResolvedValue({ response: { cached: true } });
    const next = { handle: () => of('fresh') };

    const result = await interceptor.intercept(
      rpcCtx({ idempotencyKey: 'valid-key-123' }),
      next as any,
    );
    await expect(lastValueFrom(result)).resolves.toEqual({ cached: true });
  });

  it('procesa y guarda la respuesta cuando no hay cache', async () => {
    idempotencyService.findKey.mockResolvedValue(null);
    const next = { handle: () => of('fresh') };

    const result = await interceptor.intercept(
      rpcCtx({ idempotencyKey: 'valid-key-123' }),
      next as any,
    );
    await expect(lastValueFrom(result)).resolves.toBe('fresh');
    expect(idempotencyService.saveKey).toHaveBeenCalledWith(
      'valid-key-123',
      'TCP',
      'findAll',
      'fresh',
    );
  });

  it('serializa patrones objeto como JSON', async () => {
    idempotencyService.findKey.mockResolvedValue(null);
    const next = { handle: () => of('fresh') };

    const result = await interceptor.intercept(
      rpcCtx({ idempotencyKey: 'valid-key-123' }, { cmd: 'login' }),
      next as any,
    );
    await lastValueFrom(result);
    expect(idempotencyService.saveKey).toHaveBeenCalledWith(
      'valid-key-123',
      'TCP',
      '{"cmd":"login"}',
      'fresh',
    );
  });
});
