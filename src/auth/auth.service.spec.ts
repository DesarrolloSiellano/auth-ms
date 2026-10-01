import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';
import { EncryptionService } from 'src/core/services/encryption.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from 'src/sessions/sessions.service';
import { getModelToken } from '@nestjs/mongoose';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { LocaleService } from 'src/core/services/locale.service';

describe('AuthService', () => {
  let service: AuthService;
  let encryptionService: EncryptionService;
  let jwtService: JwtService;

  const userMock = {
    _id: 'abc123',
    name: 'Juan',
    lastName: 'Pérez',
    email: 'juan@mail.com',
    username: 'juanp',
    created: new Date('2025-01-01T00:00:00Z'),
    isActived: true,
    isAdmin: true,
    isSuperAdmin: false,
    isNewUser: false,
    company: 'EmpresaX',
    tenantId: '000000',
    modules: [{ name: 'adminUserModule', routes: [] }],
    roles: [{ name: 'Administrador', codeRol: 'ADM' }],
    permissions: [{ name: 'create' }],
  };

  const mockUserModel = {
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(() => ({
      setOptions: jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    })),
  };

  const mockCompanyModel = {
    findOne: jest.fn(() => ({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    })),
    updateOne: jest.fn(() => ({
      exec: jest.fn().mockResolvedValue({}),
    })),
  };

  const mockSessionsService = {
    createSession: jest.fn().mockResolvedValue({}),
    findActiveByRefreshHash: jest.fn(),
    findActiveById: jest.fn(),
    rotateRefreshToken: jest.fn().mockResolvedValue(undefined),
    deactivateByRefreshHash: jest.fn().mockResolvedValue(undefined),
    revokeByUser: jest.fn().mockResolvedValue(0),
    touch: jest.fn().mockResolvedValue(undefined),
    isSessionActive: jest.fn().mockResolvedValue(true),
  };

  const mailServiceMock = { sendEmail: jest.fn().mockResolvedValue(undefined) };

  const tenantConfigServiceMock = {
    isEmbedEnabled: jest.fn().mockReturnValue(false),
    resolveConfig: jest.fn().mockResolvedValue({
      data: { tenantId: '0000000', company: 'EmpresaX' },
    }),
    getPolicyValue: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    tenantConfigServiceMock.getPolicyValue.mockReset();
    tenantConfigServiceMock.getPolicyValue.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: EncryptionService,
          useValue: {
            verifyPassword: jest.fn().mockResolvedValue(true),
            hashPassword: jest.fn().mockResolvedValue('hash'),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed.token'),
            verify: jest.fn(),
          },
        },
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('Company'), useValue: mockCompanyModel },
        { provide: SessionsService, useValue: mockSessionsService },
        { provide: MailService, useValue: mailServiceMock },
        {
          provide: TenantConfigService,
          useValue: tenantConfigServiceMock,
        },
        LocaleService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('secret'),
            getOrThrow: jest.fn().mockReturnValue('secret'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    encryptionService = module.get<EncryptionService>(EncryptionService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('debe generar un payload ligero de identidad en el login (sin modules/roles/permissions)', async () => {
    mockUserModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(userMock),
      }),
    });
    jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);
    const signSpy = jest.spyOn(jwtService, 'sign');

    const result = await service.login(
      { email: 'juan@mail.com', password: 'x' },
      '127.0.0.1',
    );

    expect(signSpy).toHaveBeenCalledTimes(2);
    const accessPayload = signSpy.mock.calls[0][0];
    expect(accessPayload).toEqual({
      _id: 'abc123',
      name: 'Juan',
      lastName: 'Pérez',
      email: 'juan@mail.com',
      username: 'juanp',
      isActived: true,
      company: 'EmpresaX',
      tenantId: '000000',
      isSuperAdmin: false,
      isTrial: false,
      trialStartedAt: null,
      trialEndsAt: null,
      sid: expect.any(String),
    });
    expect(accessPayload).not.toHaveProperty('modules');
    expect(accessPayload).not.toHaveProperty('roles');
    expect(accessPayload).not.toHaveProperty('permissions');
    expect(accessPayload).not.toHaveProperty('password');

    expect(result.meta.payload).toEqual(accessPayload);
  });

  it('permite iniciar sesión con email o username (normalizado a minúsculas)', async () => {
    mockUserModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(userMock),
      }),
    });
    jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);

    await service.login({ email: 'JuanP', password: 'x' }, '127.0.0.1');

    expect(mockUserModel.findOne).toHaveBeenCalledWith({
      $or: [{ email: 'juanp' }, { username: 'juanp' }],
    });
  });

  it('crea la sesión con isSuperAdmin denormalizado', async () => {
    mockUserModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(userMock),
      }),
    });
    jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);

    await service.login({ email: 'juan@mail.com', password: 'x' }, '127.0.0.1');

    expect(mockSessionsService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ isSuperAdmin: false, user: 'abc123' }),
    );
  });

  describe('refreshAccessToken', () => {
    it('refresca con un token válido, rota el refresh y devuelve payload', async () => {
      const hash = crypto
        .createHash('sha256')
        .update('valid.token')
        .digest('hex');
      const verifySpy = jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({
          _id: 'abc123',
          sid: '507f1f77bcf86cd799439011',
        } as any);
      const session = {
        _id: '507f1f77bcf86cd799439011',
        user: 'abc123',
        isActive: true,
        refreshToken: hash,
        usedRefreshTokens: [],
      };
      mockSessionsService.findActiveById.mockResolvedValue(session);
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(userMock),
        }),
      });

      const result = await service.refreshAccessToken('valid.token');

      expect(result.accessToken).toBe('signed.token');
      expect(result.refreshToken).toBeDefined();
      expect(mockSessionsService.rotateRefreshToken).toHaveBeenCalled();
      expect(result.payload).toEqual({
        _id: 'abc123',
        name: 'Juan',
        lastName: 'Pérez',
        email: 'juan@mail.com',
        username: 'juanp',
        isActived: true,
        company: 'EmpresaX',
        tenantId: '000000',
        isSuperAdmin: false,
        isTrial: false,
        trialStartedAt: null,
        trialEndsAt: null,
        sid: '507f1f77bcf86cd799439011',
      });
      expect(verifySpy).toHaveBeenCalledWith(
        'valid.token',
        expect.objectContaining({ secret: 'secret' }),
      );
    });

    it('rechaza si la sesión no existe', async () => {
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({
          _id: 'abc123',
          sid: '507f1f77bcf86cd799439011',
        } as any);
      mockSessionsService.findActiveById.mockResolvedValue(null);

      await expect(
        service.refreshAccessToken('valid.token'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('revoca todas las sesiones si detecta reuso del refresh token', async () => {
      const hash = crypto
        .createHash('sha256')
        .update('old.token')
        .digest('hex');
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({
          _id: 'abc123',
          sid: '507f1f77bcf86cd799439011',
        } as any);
      mockSessionsService.findActiveById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        user: 'abc123',
        isActive: true,
        refreshToken: 'otro-hash-vigente',
        usedRefreshTokens: [hash],
      });

      await expect(service.refreshAccessToken('old.token')).rejects.toThrow(
        /reutilizaci/i,
      );
      expect(mockSessionsService.revokeByUser).toHaveBeenCalledWith('abc123');
    });

    it('rechaza y desactiva la sesión si el token expiró', async () => {
      const expiredErr: any = new Error('jwt expired');
      expiredErr.name = 'TokenExpiredError';
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw expiredErr;
      });

      await expect(
        service.refreshAccessToken('expired.token'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockSessionsService.deactivateByRefreshHash).toHaveBeenCalled();
    });
  });

  describe('login errores', () => {
    it('rechaza si el usuario no existe', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      });

      await expect(
        service.login({ email: 'x@y.com', password: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si la contraseña es incorrecta', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(userMock),
        }),
      });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(false);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rechaza si el usuario está inactivo', async () => {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ ...userMock, isActived: false }),
        }),
      });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('bloqueo por intentos fallidos (security.*)', () => {
    function mockFindOne(user: any) {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(user),
        }),
      });
    }

    function policyValues(max: number, minutes: number) {
      tenantConfigServiceMock.getPolicyValue.mockImplementation(
        (_t: any, _c: any, key: string) => {
          if (key === 'security.maxFailedAttempts') return Promise.resolve(max);
          if (key === 'security.lockMinutes') return Promise.resolve(minutes);
          return Promise.resolve(undefined);
        },
      );
    }

    function lastSet(): any {
      const calls = mockUserModel.updateOne.mock.calls;
      return calls[calls.length - 1][1].$set;
    }

    it('bloquea al EXCEDER el máximo (max=3, fallo 4º)', async () => {
      mockFindOne({ ...userMock, failedLoginAttempts: 3 });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(false);
      policyValues(3, 15);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(/bloqueado/i);

      const set = lastSet();
      expect(set.isBlocked).toBe(true);
      expect(set.blockedUntil).toBeInstanceOf(Date);
      expect(set.failedLoginAttempts).toBe(0);
    });

    it('no bloquea si aún no excede (max=3, fallo 3º)', async () => {
      mockFindOne({ ...userMock, failedLoginAttempts: 2 });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(false);
      policyValues(3, 15);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(/Credenciales|Creadenciales/i);

      const set = lastSet();
      expect(set.isBlocked).toBeUndefined();
      expect(set.failedLoginAttempts).toBe(3);
    });

    it('maxFailedAttempts=0 = intentos ilimitados (no bloquea)', async () => {
      mockFindOne({ ...userMock, failedLoginAttempts: 999 });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(false);
      policyValues(0, 15);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(/Credenciales|Creadenciales/i);

      expect(lastSet().isBlocked).toBeUndefined();
    });

    it('lockMinutes=0 = bloqueo indefinido (blockedUntil null)', async () => {
      mockFindOne({ ...userMock, failedLoginAttempts: 5 });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(false);
      policyValues(3, 0);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(/bloqueado/i);

      const set = lastSet();
      expect(set.isBlocked).toBe(true);
      expect(set.blockedUntil).toBeNull();
    });

    it('usuario bloqueado con fecha futura no puede iniciar sesión', async () => {
      const future = new Date(Date.now() + 10 * 60 * 1000);
      mockFindOne({ ...userMock, isBlocked: true, blockedUntil: future });
      const verifySpy = jest
        .spyOn(encryptionService, 'verifyPassword')
        .mockResolvedValue(true);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(/bloqueado/i);
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('bloqueo indefinido (sin fecha) permanece bloqueado', async () => {
      mockFindOne({ ...userMock, isBlocked: true, blockedUntil: null });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toThrow(/bloqueado/i);
      expect(mockUserModel.updateOne).not.toHaveBeenCalled();
    });

    it('bloqueo con fecha expirada se limpia y permite iniciar sesión', async () => {
      const past = new Date(Date.now() - 60 * 1000);
      mockFindOne({ ...userMock, isBlocked: true, blockedUntil: past });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);

      const result = await service.login({
        email: 'juan@mail.com',
        password: 'x',
      });

      expect(result.message).toBe('Login successful');
      expect(mockUserModel.updateOne).toHaveBeenCalledWith(
        { _id: 'abc123' },
        expect.objectContaining({
          $set: expect.objectContaining({ isBlocked: false }),
        }),
      );
    });
  });

  describe('restricciones de login (empresa/prueba)', () => {
    function mockFindOne(user: any) {
      mockUserModel.findOne.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(user),
        }),
      });
    }

    function mockCompanyOnce(company: any) {
      mockCompanyModel.findOne.mockReturnValueOnce({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(company),
        }),
      });
    }

    it('bloquea el login si la empresa está bloqueada (indefinido)', async () => {
      mockFindOne(userMock);
      mockCompanyOnce({ _id: 'c1', isBlocked: true, blockedUntil: null });
      const verifySpy = jest
        .spyOn(encryptionService, 'verifyPassword')
        .mockResolvedValue(true);

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'COMPANY_BLOCKED' }),
      });
      expect(verifySpy).not.toHaveBeenCalled();
    });

    it('incluye `details.blockType` cuando la empresa está bloqueada temporalmente', async () => {
      mockFindOne(userMock);
      mockCompanyOnce({
        _id: 'c1',
        isBlocked: true,
        blockedUntil: new Date(Date.now() + 60_000),
      });

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'COMPANY_BLOCKED',
          errors: expect.arrayContaining([
            expect.objectContaining({
              details: expect.objectContaining({ blockType: 'temporary' }),
            }),
          ]),
        }),
      });
    });

    it('bloquea el login si el período de prueba expiró', async () => {
      mockFindOne({
        ...userMock,
        isTrial: true,
        trialEndsAt: new Date(Date.now() - 86_400_000),
      });

      await expect(
        service.login({ email: 'juan@mail.com', password: 'x' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TRIAL_EXPIRED' }),
      });
    });

    it('permite el login si la prueba sigue vigente', async () => {
      mockFindOne({
        ...userMock,
        isTrial: true,
        trialEndsAt: new Date(Date.now() + 86_400_000),
      });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);

      const result = await service.login({
        email: 'juan@mail.com',
        password: 'x',
      });
      expect(result.message).toBe('Login successful');
    });

    it('devuelve todos los motivos con precedencia empresa → usuario → prueba → inactivo', async () => {
      mockFindOne({
        ...userMock,
        isActived: false,
        isBlocked: true,
        blockedUntil: null,
        blockReason: 'manual',
        isTrial: true,
        trialEndsAt: new Date(Date.now() - 86_400_000),
      });
      mockCompanyOnce({ _id: 'c1', isBlocked: true, blockedUntil: null });

      try {
        await service.login({ email: 'juan@mail.com', password: 'x' });
        fail('debía lanzar ForbiddenException');
      } catch (error: any) {
        const response = error.getResponse();
        expect(response.code).toBe('COMPANY_BLOCKED');
        expect(response.errors.map((item: any) => item.code)).toEqual([
          'COMPANY_BLOCKED',
          'USER_BLOCKED_INDEFINITE',
          'TRIAL_EXPIRED',
          'USER_INACTIVE',
        ]);
      }
    });
  });

  describe('refreshAccessToken errores', () => {
    it('rechaza si el usuario está inactivo o no existe', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({ _id: 'abc123' } as any);
      mockSessionsService.findActiveByRefreshHash.mockResolvedValue({
        _id: 'sess1',
        user: 'abc123',
      });
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ ...userMock, isActived: false }),
        }),
      });

      await expect(
        service.refreshAccessToken('valid.token'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('recoveryPassword', () => {
    it('genera token de un solo uso y envía el correo (respuesta genérica)', async () => {
      const userDoc = {
        _id: 'abc123',
        email: 'juan@mail.com',
        name: 'Juan',
        lastName: 'Pérez',
        company: 'EmpresaX',
        tenantId: '000000',
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userDoc),
      });
      jest.spyOn(mailServiceMock, 'sendEmail').mockResolvedValue(undefined);

      const result = await service.recoveryPassword(
        { email: 'juan@mail.com' },
        'https://app.bponet.com.co',
      );

      expect(userDoc.passwordResetToken).toBeDefined();
      expect(userDoc.passwordResetExpires).toBeInstanceOf(Date);
      expect(userDoc.save).toHaveBeenCalled();
      expect(mailServiceMock.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ template: 'recovery' }),
      );
      expect(result.message).toMatch(/Si el correo está registrado/i);
    });

    it('responde genérico (sin revelar) si el usuario no existe', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const result = await service.recoveryPassword(
        { email: 'x@y.com' },
        '',
      );
      expect(result.message).toMatch(/Si el correo está registrado/i);
      expect(mailServiceMock.sendEmail).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    const dto = { id: 'abc123', currentPassword: 'old', newPassword: 'new' };

    it('cambia la contraseña correctamente', async () => {
      const userDoc = {
        _id: 'abc123',
        name: 'Juan',
        lastName: 'Pérez',
        password: 'hash',
      };
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userDoc),
      });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(true);
      jest.spyOn(encryptionService, 'hashPassword').mockResolvedValue('newhash');
      mockUserModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userDoc),
      });

      const result = await service.changePassword(dto);

      expect(result.message).toBe('Contraseña cambiada correctamente');
      expect(mockUserModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'abc123' },
        expect.objectContaining({ password: 'newhash', isNewUser: false }),
        expect.anything(),
      );
    });

    it('lanza BadRequest si el usuario no existe', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.changePassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lanza BadRequest si la contraseña actual es incorrecta', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'abc123', password: 'hash' }),
      });
      jest.spyOn(encryptionService, 'verifyPassword').mockResolvedValue(false);

      await expect(service.changePassword(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('setPasswordWithToken', () => {
    it('establece la contraseña y limpia el token', async () => {
      const user = {
        _id: 'abc123',
        password: 'temp',
        passwordResetToken: 'token',
        passwordResetExpires: new Date(),
        isNewUser: true,
        mustChangePassword: true,
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockUserModel.findOne.mockResolvedValue(user);

      const result = await service.setPasswordWithToken({
        token: 'raw-token',
        password: 'new-pass',
      });

      expect(user.password).toBe('new-pass');
      expect(user.isNewUser).toBe(false);
      expect(user.mustChangePassword).toBe(false);
      expect(user.save).toHaveBeenCalled();
      expect(result.message).toContain('exitosamente');
    });

    it('lanza BadRequest si el token es inválido o expiró', async () => {
      mockUserModel.findOne.mockResolvedValue(null);

      await expect(
        service.setPasswordWithToken({ token: 'raw', password: 'x' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('notificación de nuevo inicio de sesión', () => {
    const meta = { os: 'Linux', browser: 'Chrome', user_agent: 'UA' };

    function policyValues(values: Record<string, any>) {
      tenantConfigServiceMock.getPolicyValue.mockImplementation(
        (_t: any, _c: any, key: string) => Promise.resolve(values[key]),
      );
    }

    it('envía el correo con plantilla session si las tres políticas están activas', async () => {
      policyValues({
        'preferences.notifications': true,
        'preferences.notifications.newLogin': true,
        'channels.email.enabled': true,
      });

      await (service as any).notifyNewLogin(userMock, meta, '127.0.0.1');

      expect(mailServiceMock.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: userMock.email,
          template: 'session',
        }),
      );
    });

    it('NO envía si features.notificaciones está desactivada', async () => {
      policyValues({
        'features.notificaciones': false,
        'preferences.notifications': true,
        'preferences.notifications.newLogin': true,
        'channels.email.enabled': true,
      });

      await (service as any).notifyNewLogin(userMock, meta, '127.0.0.1');

      expect(mailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('NO envía si preferences.notifications está desactivada', async () => {
      policyValues({
        'preferences.notifications': false,
        'preferences.notifications.newLogin': true,
        'channels.email.enabled': true,
      });

      await (service as any).notifyNewLogin(userMock, meta, '127.0.0.1');

      expect(mailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('NO envía si preferences.notifications.newLogin está desactivada', async () => {
      policyValues({
        'preferences.notifications': true,
        'preferences.notifications.newLogin': false,
        'channels.email.enabled': true,
      });

      await (service as any).notifyNewLogin(userMock, meta, '127.0.0.1');

      expect(mailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('NO envía si channels.email.enabled está desactivada', async () => {
      policyValues({
        'preferences.notifications': true,
        'preferences.notifications.newLogin': true,
        'channels.email.enabled': false,
      });

      await (service as any).notifyNewLogin(userMock, meta, '127.0.0.1');

      expect(mailServiceMock.sendEmail).not.toHaveBeenCalled();
    });

    it('NO envía (fail-closed) si falla la consulta de la política', async () => {
      tenantConfigServiceMock.getPolicyValue.mockRejectedValue(
        new Error('db down'),
      );

      await (service as any).notifyNewLogin(userMock, meta, '127.0.0.1');

      expect(mailServiceMock.sendEmail).not.toHaveBeenCalled();
    });
  });
});
