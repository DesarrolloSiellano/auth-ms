import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { MailService } from 'src/mail/mail.service';
import { getModelToken } from '@nestjs/mongoose';

describe('UsersService', () => {
  let service: UsersService;

  const mockUserModel = {
    findById: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
  };

  const mockRolModel = {};
  const mockPermissionModel = {};
  const mockModuleModel = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('Rol'), useValue: mockRolModel },
        { provide: getModelToken('Permission'), useValue: mockPermissionModel },
        { provide: getModelToken('Module'), useValue: mockModuleModel },
        { provide: MailService, useValue: { sendEmail: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('debe devolver identidad sin password y con modules/roles/permissions completos', async () => {
      const userDoc = {
        _id: 'abc123',
        name: 'Juan',
        lastName: 'Pérez',
        email: 'juan@mail.com',
        username: 'juanp',
        password: 'hashed-secret',
        passwordResetToken: 'token',
        company: 'EmpresaX',
        tenantId: '000000',
        modules: [{ name: 'adminUserModule', routes: [] }],
        roles: [{ name: 'Administrador', codeRol: 'ADM' }],
        permissions: [{ name: 'create' }],
      };
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(userDoc),
        }),
      });

      const result = await service.getProfile({ _id: 'abc123' });

      expect(mockUserModel.findById).toHaveBeenCalledWith('abc123');
      expect(result.data.user).not.toHaveProperty('password');
      expect(result.data.user).not.toHaveProperty('passwordResetToken');
      expect(result.data.modules).toEqual([{ name: 'adminUserModule', routes: [] }]);
      expect(result.data.roles).toEqual([{ name: 'Administrador', codeRol: 'ADM' }]);
      expect(result.data.permissions).toEqual([{ name: 'create' }]);
    });

    it('debe lanzar NotFound si el usuario no existe', async () => {
      mockUserModel.findById.mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(null),
        }),
      });

      await expect(service.getProfile({ _id: 'nope' })).rejects.toThrow(
        'User not found',
      );
    });
  });
});
