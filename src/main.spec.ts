import { ConfigService } from '@nestjs/config';

const configMock = {
  get: jest.fn((key: string, defaultValue?: any) => defaultValue),
};

const loggerMock = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

const mockApp = {
  useLogger: jest.fn(),
  get: jest.fn((token: any) =>
    token === ConfigService ? configMock : loggerMock,
  ),
  setGlobalPrefix: jest.fn(),
  enableCors: jest.fn(),
  useGlobalFilters: jest.fn(),
  useGlobalPipes: jest.fn(),
  connectMicroservice: jest.fn(),
  startAllMicroservices: jest.fn().mockResolvedValue(undefined),
  listen: jest.fn().mockResolvedValue(undefined),
  getUrl: jest.fn().mockResolvedValue('http://localhost:3010'),
};

jest.mock('@nestjs/core', () => ({
  ...jest.requireActual('@nestjs/core'),
  NestFactory: { create: jest.fn().mockResolvedValue(mockApp) },
}));

jest.mock('@nestjs/swagger', () => {
  const actual = jest.requireActual('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({}),
      setup: jest.fn(),
    },
  };
});

jest.mock('fs-extra', () => ({
  pathExists: jest.fn().mockResolvedValue(false),
  copy: jest.fn().mockResolvedValue(undefined),
  readFileSync: jest.fn().mockReturnValue(Buffer.from('cert')),
}));

import { bootstrap } from './main';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import * as fsExtra from 'fs-extra';

describe('bootstrap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fsExtra.pathExists as jest.Mock).mockResolvedValue(false);
    (fsExtra.copy as jest.Mock).mockResolvedValue(undefined);
    configMock.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'TLS_ENABLED') return 'false';
      if (key === 'TLS_MUTUAL') return 'false';
      return defaultValue;
    });
  });

  it('levanta la app, registra prefijo, pipes, CORS y microservicio TCP', async () => {
    await bootstrap();

    expect((NestFactory as any).create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bufferLogs: true }),
    );
    expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(mockApp.enableCors).toHaveBeenCalled();
    expect(mockApp.useGlobalFilters).toHaveBeenCalled();
    expect(mockApp.useGlobalPipes).toHaveBeenCalled();
    expect(mockApp.startAllMicroservices).toHaveBeenCalled();
    expect([3010, '3010']).toContain(mockApp.listen.mock.calls[0][0]);
    expect((SwaggerModule as any).setup).toHaveBeenCalledWith(
      'api-docs',
      mockApp,
      expect.anything(),
    );
  });

  it('activa TLS/mTLS en el microservicio cuando TLS_ENABLED=true', async () => {
    configMock.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'TLS_ENABLED') return 'true';
      if (key === 'TLS_MUTUAL') return 'true';
      if (key === 'TLS_KEY_PATH') return '/certs/key.pem';
      if (key === 'TLS_CERT_PATH') return '/certs/cert.pem';
      if (key === 'TLS_CA_PATH') return '/certs/ca.pem';
      return defaultValue;
    });

    await bootstrap();

    expect(mockApp.connectMicroservice).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          tls: expect.objectContaining({
            requestCert: true,
            rejectUnauthorized: true,
          }),
        }),
      }),
    );
  });

  it('lanza error si TLS_ENABLED=true sin rutas de certs', async () => {
    configMock.get.mockImplementation((key: string, defaultValue?: any) => {
      if (key === 'TLS_ENABLED') return 'true';
      return defaultValue;
    });

    await expect(bootstrap()).rejects.toThrow(/TLS_KEY_PATH/);
  });

  it('no copia templates si ya existen', async () => {
    (fsExtra.pathExists as jest.Mock).mockResolvedValue(true);

    await bootstrap();

    expect((fsExtra.copy as jest.Mock)).not.toHaveBeenCalled();
  });

  it('continúa si falla la copia de templates', async () => {
    (fsExtra.copy as jest.Mock).mockRejectedValue(new Error('copy fail'));

    await expect(bootstrap()).resolves.toBeUndefined();
  });
});
