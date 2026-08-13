import { JwtStrategy } from './jwt.strategy';
import { UnauthorizedException } from '@nestjs/common';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  const configServiceMock = { getOrThrow: jest.fn().mockReturnValue('secret') };
  const mockUserModel = { findById: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    strategy = new JwtStrategy(configServiceMock as any, mockUserModel as any);
  });

  it('retorna el usuario sanitizado si existe y está activo', async () => {
    const user = { _id: 'abc', name: 'Juan', isActived: true, password: 'hash' };
    mockUserModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
    });

    const result = await strategy.validate({ _id: 'abc' } as any);

    expect(mockUserModel.findById).toHaveBeenCalledWith('abc');
    expect(result).toMatchObject({ name: 'Juan', isActived: true });
    expect(result).not.toHaveProperty('password');
  });

  it('lanza 401 si el usuario no existe', async () => {
    mockUserModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    });

    await expect(strategy.validate({ _id: 'abc' } as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('lanza 401 si el usuario está inactivo', async () => {
    const user = { _id: 'abc', isActived: false };
    mockUserModel.findById.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(user) }),
    });

    await expect(strategy.validate({ _id: 'abc' } as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
