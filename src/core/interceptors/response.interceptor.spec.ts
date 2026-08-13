import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<any>;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
  });

  function context(type: string, statusCode = 200): any {
    return {
      getType: () => type,
      switchToHttp: () => ({ getResponse: () => ({ statusCode }) }),
    };
  }

  it('envuelve un resultado plano en data con statusCode y meta', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context('http'), {
        handle: () => of([{ id: 1 }]),
      } as any),
    );

    expect(result).toMatchObject({
      statusCode: 200,
      status: 'Success',
      data: [{ id: 1 }],
      meta: { totalData: 1 },
    });
  });

  it('preserva un resultado ya formateado (con status y statusCode)', async () => {
    const already = {
      statusCode: 200,
      status: 'Success',
      message: 'ok',
      data: { x: 1 },
      meta: { totalData: 1 },
    };

    const result = await lastValueFrom(
      interceptor.intercept(context('http'), {
        handle: () => of(already),
      } as any),
    );

    expect(result).toEqual(already);
  });

  it('usa el meta del resultado si existe y no envuelve data si no viene data', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context('http'), {
        handle: () => of({ meta: { totalData: 1 }, token: 'abc' }),
      } as any),
    );

    expect(result.data).toBeUndefined();
    expect(result.meta).toEqual({ totalData: 1 });
  });

  it('asigna data = resultado cuando no hay data ni meta', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(context('http'), {
        handle: () => of({ foo: 'bar' }),
      } as any),
    );

    expect(result.data).toEqual({ foo: 'bar' });
  });

  it('en contexto RPC quita el statusCode de resultados ya formateados', async () => {
    const already = {
      statusCode: 200,
      status: 'Success',
      message: 'ok',
      meta: { totalData: 1 },
    };

    const result = await lastValueFrom(
      interceptor.intercept(context('rpc'), {
        handle: () => of(already),
      } as any),
    );

    expect(result).toEqual({
      status: 'Success',
      message: 'ok',
      meta: { totalData: 1 },
    });
  });
});
