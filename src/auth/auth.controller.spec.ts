import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtTCPStrategy } from 'src/core/strategies/jwtTCP.strategy';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    login: jest.fn(),
    recoveryPassword: jest.fn(),
    changePassword: jest.fn(),
    refreshAccessToken: jest.fn(),
    setPasswordWithToken: jest.fn(),
  };
  const jwtTCPMock = { validate: jest.fn() };
  const configMock = {
    get: jest.fn((key: string) => {
      if (key === 'SSO_ALLOWED_ORIGINS') return 'app.bponet.com.co,localhost';
      return undefined;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: JwtTCPStrategy, useValue: jwtTCPMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    const credentials = { email: 'a@b.com', password: 'x' } as any;
    const loginResult = {
      meta: { accessToken: 'at', refreshToken: 'rt' },
    };

    it('devuelve el resultado sin redirectUri', async () => {
      authServiceMock.login.mockResolvedValue(loginResult);

      const result = await controller.login(credentials, '', {} as any, '1.1.1.1');

      expect(authServiceMock.login).toHaveBeenCalledWith(credentials, '1.1.1.1');
      expect(result).toEqual(loginResult);
    });

    it('redirige a un origen permitido con los tokens', async () => {
      authServiceMock.login.mockResolvedValue(loginResult);

      const result = await controller.login(
        credentials,
        'https://app.bponet.com.co/dashboard',
        {} as any,
        'ip',
      );

      expect(result).toEqual({
        url: 'https://app.bponet.com.co/dashboard?access_token=at&refresh_token=rt',
        message: 'Login successful',
      });
    });

    it('no redirige a un origen no permitido', async () => {
      authServiceMock.login.mockResolvedValue(loginResult);

      const result = await controller.login(
        credentials,
        'https://evil.com/x',
        {} as any,
        'ip',
      );

      expect(result).toEqual(loginResult);
    });

    it('ignora un redirectUri inválido y devuelve el resultado', async () => {
      authServiceMock.login.mockResolvedValue(loginResult);

      const result = await controller.login(
        credentials,
        'not-a-url',
        {} as any,
        'ip',
      );

      expect(result).toEqual(loginResult);
    });
  });

  describe('otros endpoints', () => {
    it('recoveryPassword delega en el servicio', () => {
      authServiceMock.recoveryPassword.mockReturnValue('r');

      const result = controller.recoveryPassword(
        { email: 'a@b.com' } as any,
        'https://app.bponet.com.co',
      );

      expect(result).toBe('r');
      expect(authServiceMock.recoveryPassword).toHaveBeenCalledWith(
        { email: 'a@b.com' },
        'https://app.bponet.com.co',
      );
    });

    it('changePassword toma el _id del token', () => {
      authServiceMock.changePassword.mockReturnValue('ok');
      const dto = { id: 'client-id', currentPassword: 'old', newPassword: 'new' };

      const result = controller.changePassword(dto as any, {
        user: { _id: 'token-id' },
      });

      expect(dto.id).toBe('token-id');
      expect(authServiceMock.changePassword).toHaveBeenCalledWith(dto);
      expect(result).toBe('ok');
    });

    it('validateUser devuelve el usuario y meta', () => {
      const result = controller.validateUser({ user: { _id: 'u1' } });

      expect(result).toEqual({
        user: { _id: 'u1' },
        meta: { totalData: 1, id: 'u1', valid: true },
      });
    });

    it('setPasswordWithToken delega en el servicio', () => {
      authServiceMock.setPasswordWithToken.mockReturnValue('ok');

      expect(
        controller.setPasswordWithToken({ token: 't', password: 'p' } as any),
      ).toBe('ok');
    });

    it('refresh delega en el servicio', async () => {
      authServiceMock.refreshAccessToken.mockResolvedValue('refreshed');

      await expect(
        controller.refresh({ refreshToken: 'rt' } as any),
      ).resolves.toBe('refreshed');
    });

    it('msLogin delega con ip desde el payload', async () => {
      authServiceMock.login.mockResolvedValue('login');
      const payload = {
        email: 'a@b.com',
        password: 'x',
        meta: { ip: '9.9.9.9' },
      };

      await expect(controller.msLogin(payload as any)).resolves.toBe('login');
      expect(authServiceMock.login).toHaveBeenCalledWith(payload, '9.9.9.9');
    });

    it('msValidateUser valida el token', async () => {
      jwtTCPMock.validate.mockResolvedValue({ _id: 'u1' });

      await expect(controller.msValidateUser({ token: 'tok' })).resolves.toEqual(
        {
          user: { _id: 'u1' },
          meta: { totalData: 1, id: 'u1', valid: true },
        },
      );
      expect(jwtTCPMock.validate).toHaveBeenCalledWith('tok');
    });

    it('msRefresh delega en el servicio', async () => {
      authServiceMock.refreshAccessToken.mockResolvedValue('r');

      await expect(
        controller.msRefresh({ refreshToken: 'rt' } as any),
      ).resolves.toBe('r');
    });

    it('msRecoveryPassword delega en el servicio de cambio de contraseña', () => {
      authServiceMock.changePassword.mockReturnValue('cp');

      expect(controller.msRecoveryPassword({ id: 'x' } as any)).toBe('cp');
    });
  });
});
