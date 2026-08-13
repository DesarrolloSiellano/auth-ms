import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { EncryptionService } from 'src/core/services/encryption.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { SessionsService } from 'src/sessions/sessions.service';
import { getModelToken } from '@nestjs/mongoose';

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
  };

  const mockSessionsService = {
    createSession: jest.fn().mockResolvedValue({}),
    findActiveByRefreshHash: jest.fn(),
    deactivateByRefreshHash: jest.fn().mockResolvedValue(undefined),
  };

  const mailServiceMock = { sendEmail: jest.fn().mockResolvedValue(undefined) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: EncryptionService,
          useValue: { verifyPassword: jest.fn(), hashPassword: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed.token'),
            verify: jest.fn(),
          },
        },
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: SessionsService, useValue: mockSessionsService },
        { provide: MailService, useValue: mailServiceMock },
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
    });
    expect(accessPayload).not.toHaveProperty('modules');
    expect(accessPayload).not.toHaveProperty('roles');
    expect(accessPayload).not.toHaveProperty('permissions');
    expect(accessPayload).not.toHaveProperty('password');

    expect(result.meta.payload).toEqual(accessPayload);
  });

  describe('refreshAccessToken', () => {
    it('refresca con un token válido y devuelve payload de identidad', async () => {
      const verifySpy = jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ _id: 'abc123' } as any);
      const session = { _id: 'sess1', user: 'abc123', isActive: true };
      mockSessionsService.findActiveByRefreshHash.mockResolvedValue(session);
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(userMock),
        }),
      });

      const result = await service.refreshAccessToken('valid.token');

      expect(result.accessToken).toBe('signed.token');
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
      });
      expect(verifySpy).toHaveBeenCalledWith('valid.token', {
        secret: 'secret',
      });
    });

    it('rechaza si la sesión no existe', async () => {
      jest
        .spyOn(jwtService, 'verify')
        .mockReturnValue({ _id: 'abc123' } as any);
      mockSessionsService.findActiveByRefreshHash.mockResolvedValue(null);

      await expect(
        service.refreshAccessToken('valid.token'),
      ).rejects.toThrow(ForbiddenException);
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
    it('genera contraseña temporal, la actualiza y envía el correo', async () => {
      const userDoc = {
        _id: 'abc123',
        email: 'juan@mail.com',
        name: 'Juan',
        lastName: 'Pérez',
      };
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(userDoc),
      });
      mockUserModel.findByIdAndUpdate.mockResolvedValue(userDoc);
      jest.spyOn(encryptionService, 'hashPassword').mockResolvedValue('hashed');
      jest.spyOn(mailServiceMock, 'sendEmail').mockResolvedValue(undefined);

      const result = await service.recoveryPassword(
        { email: 'juan@mail.com' },
        'https://app.bponet.com.co',
      );

      expect(mockUserModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'abc123',
        expect.objectContaining({ isNewUser: true }),
      );
      expect(mailServiceMock.sendEmail).toHaveBeenCalled();
      expect(result.message).toBe('Contraseña temporal enviada por correo');
    });

    it('lanza BadRequest si el usuario no existe', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.recoveryPassword({ email: 'x@y.com' }, ''),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequest si no se pudo actualizar la contraseña', async () => {
      mockUserModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: 'abc123' }),
      });
      mockUserModel.findByIdAndUpdate.mockResolvedValue(null);

      await expect(
        service.recoveryPassword({ email: 'juan@mail.com' }, ''),
      ).rejects.toThrow(BadRequestException);
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
        save: jest.fn().mockResolvedValue(undefined),
      };
      mockUserModel.findOne.mockResolvedValue(user);

      const result = await service.setPasswordWithToken({
        token: 'raw-token',
        password: 'new-pass',
      });

      expect(user.password).toBe('new-pass');
      expect(user.isNewUser).toBe(false);
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
});
