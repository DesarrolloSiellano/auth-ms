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

  it('responde 500 genérico para errores no HttpException', () => {
    filter.catch(new Error('boom'), httpHost());

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'boom' }),
    );
  });

  it('traduce errores de duplicado de Mongo (11000)', () => {
    const err: any = new Error('dup');
    err.code = 11000;
    err.keyValue = { email: 'x@y.com' };

    filter.catch(err, httpHost());

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Duplicate key error: email already exists',
      }),
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
