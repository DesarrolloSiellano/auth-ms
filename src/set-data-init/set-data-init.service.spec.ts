import { SetDataInit } from './set-data-init.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

describe('SetDataInit', () => {
  let service: SetDataInit;
  const originalEnv = process.env.NODE_ENV;

  const mockRolModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  mockRolModel.findOne = jest.fn();
  mockRolModel.find = jest.fn();

  const mockPermissionsModel: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
  };

  const mockUserModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  mockUserModel.findOne = jest.fn();
  mockUserModel.create = jest.fn();
  mockUserModel.updateOne = jest.fn().mockResolvedValue({});

  const mockModuleModel: any = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    updateOne: jest.fn().mockResolvedValue({}),
  };

  const mockCompanyModel: any = {
    findOne: jest.fn(),
    insertMany: jest.fn().mockResolvedValue([]),
  };

  function leanResolve(value: any) {
    return { lean: () => ({ exec: () => Promise.resolve(value) }) };
  }
  function mongoError(code: number) {
    const err: any = new Error('dup');
    err.code = code;
    return err;
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRolModel.findOne.mockReturnValue(leanResolve(null));
    mockRolModel.find.mockReturnValue(leanResolve([]));
    mockPermissionsModel.findOne.mockReturnValue(leanResolve(null));
    mockPermissionsModel.find.mockReturnValue(leanResolve([]));
    mockModuleModel.findOne.mockReturnValue(leanResolve(null));
    mockModuleModel.find.mockReturnValue(leanResolve([]));
    mockCompanyModel.findOne.mockReturnValue(
      leanResolve({ _id: 'c1', name: 'BPONET', id: 'c1' }),
    );
    mockUserModel.findOne.mockReturnValue(leanResolve(null));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetDataInit,
        { provide: getModelToken('Rol'), useValue: mockRolModel },
        { provide: getModelToken('Permission'), useValue: mockPermissionsModel },
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('Module'), useValue: mockModuleModel },
        { provide: getModelToken('Company'), useValue: mockCompanyModel },
        {
          provide: TenantConfigService,
          useValue: {
            seedDefaultCatalog: jest.fn().mockResolvedValue(0),
            ensureConfig: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<SetDataInit>(SetDataInit);
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInitModules', () => {
    it('crea módulos y omite los existentes', async () => {
      mockModuleModel.findOne.mockReturnValue(leanResolve({ _id: 'm1' }));
      await service.createInitModules();
      expect(mockModuleModel.create).not.toHaveBeenCalled();
    });

    it('agrega rutas nuevas al módulo existente (p. ej. dashboard)', async () => {
      mockModuleModel.findOne.mockReturnValue(
        leanResolve({
          _id: 'm1',
          routes: [{ name: 'Users', path: '/pages/users', isActive: true }],
        }),
      );

      await service.createInitModules();

      expect(mockModuleModel.updateOne).toHaveBeenCalled();
      const updateArg = mockModuleModel.updateOne.mock.calls[0][1];
      const paths = updateArg.$set.routes.map((r: any) => r.path);
      expect(paths).toContain('/pages/dashboard');
    });

    it('lanza el error si algo falla', async () => {
      mockModuleModel.create.mockRejectedValueOnce(new Error('boom'));
      await expect(service.createInitModules()).rejects.toThrow('boom');
    });
  });

  describe('syncAdminUserModules', () => {
    it('agrega la ruta dashboard al admin existente', async () => {
      mockModuleModel.find.mockReturnValue(
        leanResolve([
          {
            _id: 'm1',
            name: 'adminUserModule',
            routes: [
              { name: 'Users', path: '/pages/users', isActive: true },
              {
                name: 'Dashboard',
                path: '/pages/dashboard',
                isActive: true,
              },
            ],
          },
        ]),
      );
      mockUserModel.findOne.mockReturnValue(
        leanResolve({
          _id: 'u1',
          email: 'admin@admin.com',
          modules: [
            {
              _id: 'm1',
              name: 'adminUserModule',
              routes: [{ name: 'Users', path: '/pages/users', isActive: true }],
            },
          ],
        }),
      );

      await service.syncAdminUserModules();

      expect(mockUserModel.updateOne).toHaveBeenCalled();
      const updateArg = mockUserModel.updateOne.mock.calls[0][1];
      const paths = updateArg.$set.modules[0].routes.map((r: any) => r.path);
      expect(paths).toContain('/pages/dashboard');
    });
  });

  describe('createInitPermissions', () => {
    it('crea permisos y omite existentes', async () => {
      mockPermissionsModel.findOne.mockReturnValue(leanResolve({ _id: 'p1' }));
      await service.createInitPermissions();
      expect(mockPermissionsModel.create).not.toHaveBeenCalled();
    });

    it('ignora errores de duplicado 11000', async () => {
      mockPermissionsModel.create.mockRejectedValueOnce(mongoError(11000));
      await expect(service.createInitPermissions()).resolves.toBeUndefined();
    });

    it('lanza otros errores', async () => {
      mockPermissionsModel.create.mockRejectedValueOnce(new Error('boom'));
      await expect(service.createInitPermissions()).rejects.toThrow('boom');
    });
  });

  describe('createInitRoles', () => {
    const permissions = [
      { _id: 'p1', name: 'Crear', description: 'd', action: 'create', resource: 'r', type: 't' },
      { _id: 'p2', name: 'Leer', description: 'd', action: 'read', resource: 'r', type: 't' },
    ];

    it('calcula permisos por rol (ADM/AUD/USR) y crea roles', async () => {
      mockPermissionsModel.find.mockReturnValue(leanResolve(permissions));

      await service.createInitRoles();

      expect(mockRolModel).toHaveBeenCalledTimes(3); // ADM, AUD, USR
    });

    it('omite roles existentes', async () => {
      mockRolModel.findOne.mockReturnValue(leanResolve({ _id: 'r1' }));
      await service.createInitRoles();
      expect(mockRolModel).not.toHaveBeenCalled();
    });

    it('ignora duplicados 11000', async () => {
      mockPermissionsModel.find.mockReturnValue(leanResolve([]));
      mockRolModel.mockImplementationOnce(() => ({
        save: jest.fn().mockRejectedValue(mongoError(11000)),
      }));
      await expect(service.createInitRoles()).resolves.toBeUndefined();
    });

    it('lanza otros errores', async () => {
      mockPermissionsModel.find.mockReturnValue(leanResolve([]));
      mockRolModel.mockImplementationOnce(() => ({
        save: jest.fn().mockRejectedValue(new Error('boom')),
      }));
      await expect(service.createInitRoles()).rejects.toThrow('boom');
    });
  });

  describe('createInitCompanies', () => {
    it('inserta compañías y omite duplicados 11000', async () => {
      mockCompanyModel.insertMany.mockRejectedValueOnce(mongoError(11000));
      await expect(service.createInitCompanies()).resolves.toBeUndefined();
    });

    it('lanza otros errores', async () => {
      mockCompanyModel.insertMany.mockRejectedValueOnce(new Error('boom'));
      await expect(service.createInitCompanies()).rejects.toThrow('boom');
    });
  });

  describe('createAdminUsers', () => {
    it('no hace nada si no existe la compañía BPONET', async () => {
      mockCompanyModel.findOne.mockReturnValue(leanResolve(null));
      await service.createAdminUsers();
      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });

    it('omite admin existentes', async () => {
      mockUserModel.findOne.mockReturnValue(leanResolve({ _id: 'u1' }));
      await service.createAdminUsers();
      expect(mockUserModel).not.toHaveBeenCalled();
    });

    it('lanza el error si algo falla', async () => {
      mockUserModel.save = jest.fn();
      mockUserModel.mockImplementationOnce(() => ({
        save: jest.fn().mockRejectedValue(new Error('boom')),
      }));
      await expect(service.createAdminUsers()).rejects.toThrow('boom');
    });
  });

  describe('validateIfDataExists', () => {
    it('avisa y no crea admins en producción', async () => {
      process.env.NODE_ENV = 'production';
      await service.validateIfDataExists();
      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });

    it('crea el admin en desarrollo', async () => {
      process.env.NODE_ENV = 'development';
      await service.validateIfDataExists();
      expect(mockUserModel.findOne).toHaveBeenCalled();
      expect(mockUserModel).toHaveBeenCalled();
    });

    it('retorna si no existe BPONET tras la inicialización', async () => {
      mockCompanyModel.findOne.mockReturnValueOnce(leanResolve(null)).mockReturnValue(leanResolve(null));
      await expect(service.validateIfDataExists()).resolves.toBeUndefined();
    });

    it('captura errores sin propagarlos', async () => {
      mockModuleModel.create.mockRejectedValueOnce(new Error('boom'));
      await expect(service.validateIfDataExists()).resolves.toBeUndefined();
    });
  });
});
