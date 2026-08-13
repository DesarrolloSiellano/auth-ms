import { JwtTCPStrategy } from './jwtTCP.strategy';
import { UnauthorizedException } from '@nestjs/common';

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
  TokenExpiredError: class TokenExpiredError extends Error {
    expiredAt?: number;
  },
}));

import * as jwt from 'jsonwebtoken';

describe('JwtTCPStrategy', () => {
  let strategy: JwtTCPStrategy;
  const configServiceMock = { getOrThrow: jest.fn().mockReturnValue('secret') };
  const mockUserModel = { findById: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    (jwt.verify as jest.Mock).mockReset();
    strategy = new JwtTCPStrategy(configServiceMock as any, mockUserModel as any);
  });

  it('lanza 401 si no hay token', async () => {
    await expect(strategy.validate('')).rejects.toThrow(UnauthorizedException);
  });

  it('valida un token con prefijo Bearer y retorna usuario sanitizado', async () => {
    const user = { _id: 'abc', name: 'Juan', password: 'hash' };
    mockUserModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
    });
    (jwt.verify as jest.Mock).mockReturnValue({ _id: 'abc' });

    const result = await strategy.validate('Bearer token');

    expect(jwt.verify).toHaveBeenCalledWith('token', 'secret');
    expect(result).toMatchObject({ name: 'Juan' });
    expect(result).not.toHaveProperty('password');
  });

  it('lanza SESSION_EXPIRED si el token expiró', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired');
    });

    await expect(strategy.validate('token')).rejects.toThrow('SESSION_EXPIRED');
  });

  it('lanza 401 si el token es inválido', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(strategy.validate('token')).rejects.toThrow(UnauthorizedException);
  });

  it('lanza 401 si el usuario no existe', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ _id: 'abc' });
    mockUserModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    });

    await expect(strategy.validate('token')).rejects.toThrow(UnauthorizedException);
  });
});
