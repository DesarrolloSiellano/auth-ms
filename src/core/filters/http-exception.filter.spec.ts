import { HttpException, HttpStatus } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  const json = jest.fn();
  const status = jest.fn(() => ({ json }));
  const response = { status };
  const request = { url: '/api/users' };

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    jest.clearAllMocks();
  });

  function httpHost(): any {
    return {
      getType: () => 'http',
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };
  }

  it('responde con status y message de un HttpException', () => {
    filter.catch(new HttpException('boom', HttpStatus.BAD_REQUEST), httpHost());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, status: 'Error', data: null }),
    );
  });

  it('responde 500 genérico (sin filtrar detalles internos) y requestId', () => {
    filter.catch(new Error('boom'), httpHost());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Error interno al procesar la solicitud',
        requestId: expect.any(String),
      }),
    );
  });

  it('traduce errores de duplicado de Mongo (11000) sin exponer el índice', () => {
    const err: any = new Error('dup');
    err.code = 11000;
    err.keyValue = { email: 'x@y.com' };

    filter.catch(err, httpHost());

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'El correo ya está registrado' }),
    );
  });

  it('estructura el message cuando es objeto', () => {
    filter.catch(
      new HttpException({ message: ['campo inválido'] }, 422),
      httpHost(),
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: ['campo inválido'] }),
    );
  });

  it('propaga code y errors estructurados (login)', () => {
    filter.catch(
      new HttpException(
        {
          message: 'Tu empresa está bloqueada.',
          code: 'COMPANY_BLOCKED',
          errors: [
            { code: 'COMPANY_BLOCKED', message: 'Tu empresa está bloqueada.' },
          ],
        },
        403,
      ),
      httpHost(),
    );

    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Tu empresa está bloqueada.',
        code: 'COMPANY_BLOCKED',
        errors: expect.any(Array),
        statusCode: 403,
      }),
    );
  });

  it('devuelve errorBody para contexto RPC sin statusCode ni path', () => {
    const rpcHost = {
      getType: () => 'rpc',
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    };

    const result = filter.catch(new HttpException('rpc error', 401), rpcHost);

    expect(result).toEqual(
      expect.objectContaining({
        message: 'rpc error',
        status: 'Error',
      }),
    );
    expect(result).not.toHaveProperty('statusCode');
  });
});
