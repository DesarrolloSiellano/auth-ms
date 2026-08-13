import { lastValueFrom, of } from 'rxjs';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { BadRequestException } from '@nestjs/common';

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;
  const idempotencyService = {
    findKey: jest.fn(),
    saveKey: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    interceptor = new IdempotencyInterceptor(idempotencyService as any);
  });

  function ctx(method: string, headers: Record<string, any> = {}): any {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getRequest: () => ({ method, url: '/x', headers }),
      }),
    };
  }

  it('deja pasar métodos que no son POST/PATCH', async () => {
    const next = { handle: () => of('ok') };
    const result = await interceptor.intercept(ctx('GET'), next as any);
    await expect(lastValueFrom(result)).resolves.toBe('ok');
  });

  it('deja pasar si no hay x-idempotency-key', async () => {
    const next = { handle: () => of('ok') };
    const result = await interceptor.intercept(ctx('POST'), next as any);
    await expect(lastValueFrom(result)).resolves.toBe('ok');
  });

  it('rechaza una key de formato inválido', async () => {
    const next = { handle: () => of('ok') };
    await expect(
      interceptor.intercept(ctx('POST', { 'x-idempotency-key': 'short' }), next as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('devuelve la respuesta cacheada si la key ya se procesó', async () => {
    idempotencyService.findKey.mockResolvedValue({ response: { cached: true } });
    const next = { handle: () => of('fresh') };

    const result = await interceptor.intercept(
      ctx('POST', { 'x-idempotency-key': 'valid-key-123' }),
      next as any,
    );
    await expect(lastValueFrom(result)).resolves.toEqual({ cached: true });
    expect(idempotencyService.findKey).toHaveBeenCalledWith(
      'valid-key-123',
      'POST',
      '/x',
    );
  });

  it('procesa y guarda la respuesta cuando no hay cache', async () => {
    idempotencyService.findKey.mockResolvedValue(null);
    const next = { handle: () => of('fresh') };

    const result = await interceptor.intercept(
      ctx('POST', { 'x-idempotency-key': 'valid-key-123' }),
      next as any,
    );
    await expect(lastValueFrom(result)).resolves.toBe('fresh');
    expect(idempotencyService.saveKey).toHaveBeenCalledWith(
      'valid-key-123',
      'POST',
      '/x',
      'fresh',
    );
  });

  it('deja pasar contextos que no son http', async () => {
    const rpcCtx = { getType: () => 'rpc' };
    const next = { handle: () => of('rpc') };
    const result = await interceptor.intercept(rpcCtx as any, next as any);
    await expect(lastValueFrom(result)).resolves.toBe('rpc');
  });
});
