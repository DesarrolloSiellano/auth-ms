import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { EncryptionService } from 'src/core/services/encryption.service';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
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
  };

  const mockSessionModel = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  mockSessionModel.findOne = jest.fn();

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
        { provide: getModelToken('Session'), useValue: mockSessionModel },
        { provide: MailService, useValue: { sendEmail: jest.fn() } },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
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
});
