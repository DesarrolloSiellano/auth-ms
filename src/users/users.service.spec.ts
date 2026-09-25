import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { MailService } from 'src/mail/mail.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

jest.mock('./helpers/user-resolution.helper', () => ({
  resolveUserRoles: jest.fn().mockResolvedValue([]),
  resolveUserPermissions: jest.fn().mockResolvedValue([]),
  resolveUserModules: jest.fn().mockResolvedValue([]),
}));

import {
  resolveUserRoles,
  resolveUserPermissions,
  resolveUserModules,
} from './helpers/user-resolution.helper';

describe('UsersService', () => {
  let service: UsersService;
  let tenantConfigServiceMock: any;

  const mockUserModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({
      ...data,
      _id: 'new-id',
      toObject: () => data,
    }),
  }));
  mockUserModel.find = jest.fn();
  mockUserModel.findOne = jest.fn().mockReturnValue(leanExec(null));
  mockUserModel.findById = jest.fn();
  mockUserModel.findByIdAndUpdate = jest.fn();
  mockUserModel.findByIdAndDelete = jest.fn();
  mockUserModel.countDocuments = jest.fn();

  const mailServiceMock = { sendEmail: jest.fn().mockResolvedValue(undefined) };

  function leanExec(value: any) {
    const execResult = { exec: jest.fn().mockResolvedValue(value) };
    return {
      lean: jest.fn().mockReturnValue(execResult),
      setOptions: jest.fn().mockReturnValue({
        lean: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(value),
        }),
      }),
    };
  }
  function exec(value: any) {
    return { exec: jest.fn().mockResolvedValue(value) };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    tenantConfigServiceMock = {
      isEmbedEnabled: jest.fn().mockReturnValue(false),
      resolveConfig: jest.fn().mockResolvedValue({ data: {} }),
      getPolicyValue: jest.fn().mockResolvedValue(0),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('Rol'), useValue: {} },
        { provide: getModelToken('Permission'), useValue: {} },
        { provide: getModelToken('Module'), useValue: {} },
        { provide: MailService, useValue: mailServiceMock },
        {
          provide: TenantConfigService,
          useValue: tenantConfigServiceMock,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crea un usuario con password temporal, sanitiza y envía email', async () => {
      const dto = {
        name: 'Juan',
        lastName: 'Pérez',
        email: 'j@mail.com',
        phone: '1',
        isActived: true,
        isAdmin: false,
        isSuperAdmin: false,
        isNewUser: true,
      } as any;

      const result = await service.create(dto);

      expect(result.message).toContain('created');
      expect(result.data).not.toHaveProperty('password');
      expect(result.meta.id).toBe('new-id');
      expect(mailServiceMock.sendEmail).toHaveBeenCalled();
    });

    it('normaliza email y username a minúsculas', async () => {
      const dto = {
        name: 'Juan',
        lastName: 'Pérez',
        email: 'J@Mail.com',
        username: 'JuanP',
        phone: '',
        isActived: true,
        isAdmin: false,
        isSuperAdmin: false,
        isNewUser: true,
      } as any;

      await service.create(dto);

      const created = mockUserModel.mock.calls[0][0];
      expect(created.email).toBe('j@mail.com');
      expect(created.username).toBe('juanp');
    });

    it('lanza conflicto si el username ya existe', async () => {
      mockUserModel.findOne
        .mockReturnValueOnce(leanExec(null))
        .mockReturnValueOnce(leanExec({ _id: 'otro' }));

      await expect(
        service.create({
          name: 'Juan',
          lastName: 'Pérez',
          email: 'j@mail.com',
          username: 'juanp',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('bloquea la creación si se alcanzó el máximo de usuarios (limits.maxUsers)', async () => {
      tenantConfigServiceMock.getPolicyValue.mockResolvedValue(5);
      mockUserModel.countDocuments.mockReturnValue({
        setOptions: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(5),
        }),
      });

      await expect(
        service.create({
          name: 'Juan',
          lastName: 'Pérez',
          email: 'j@mail.com',
          company: 'EmpresaX',
        } as any),
      ).rejects.toThrow(ConflictException);
    });

    it('permite crear si el límite es 0 (ilimitado)', async () => {
      tenantConfigServiceMock.getPolicyValue.mockResolvedValue(0);
      mockUserModel.findOne.mockReturnValue(leanExec(null));

      const result = await service.create({
        name: 'Juan',
        lastName: 'Pérez',
        email: 'j@mail.com',
        company: 'EmpresaX',
        isActived: true,
        isAdmin: false,
        isSuperAdmin: false,
        isNewUser: true,
      } as any);

      expect(result.message).toContain('created');
    });
  });

  describe('checkAvailability', () => {
    it('devuelve emailExists y usernameExists', async () => {
      mockUserModel.findOne
        .mockReturnValueOnce(leanExec({ _id: 'x' }))
        .mockReturnValueOnce(leanExec(null));

      const result = await service.checkAvailability({
        email: 'J@Mail.com',
        username: 'JuanP',
      });

      expect(result.data.emailExists).toBe(true);
      expect(result.data.usernameExists).toBe(false);
    });

    it('no consulta cuando no hay valores', async () => {
      mockUserModel.findOne.mockClear();

      const result = await service.checkAvailability({});

      expect(result.data).toEqual({
        emailExists: false,
        usernameExists: false,
      });
      expect(mockUserModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('createExternal', () => {
    it('crea un usuario externo resolviendo roles/permisos/módulos', async () => {
      const payload = {
        _id: 'ext-1',
        name: 'Juan',
        lastName: 'Pérez',
        email: 'j@mail.com',
        phone: '1',
        company: 'EmpX',
      };

      const result = await service.createExternal(payload);

      expect(resolveUserRoles).toHaveBeenCalled();
      expect(resolveUserPermissions).toHaveBeenCalled();
      expect(resolveUserModules).toHaveBeenCalled();
      expect(result.statusCode).toBe(201);
      expect(result.data).not.toHaveProperty('password');
      expect(mailServiceMock.sendEmail).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('filtra por company si no es superadmin', async () => {
      mockUserModel.find.mockReturnValue(leanExec([{ _id: 'a', password: 'x' }]));

      const result = await service.findAll({ company: 'EmpX', isSuperAdmin: false });

      expect(mockUserModel.find).toHaveBeenCalledWith({ deletedAt: null, company: 'EmpX' });
      expect(result[0]).not.toHaveProperty('password');
    });

    it('no filtra si es superadmin', async () => {
      mockUserModel.find.mockReturnValue(leanExec([{ _id: 'a' }]));

      await service.findAll({ company: 'EmpX', isSuperAdmin: true });

      expect(mockUserModel.find).toHaveBeenCalledWith({ deletedAt: null });
    });

    it('lanza NotFound si no hay usuarios', async () => {
      mockUserModel.find.mockReturnValue(leanExec([]));

      await expect(service.findAll()).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActiveByTenant', () => {
    it('filtra solo agentes cuando onlyAgents=true', async () => {
      mockUserModel.find.mockReturnValue(
        leanExec([
          { _id: 'a', roles: [{ codeRol: 'AGE' }] },
          { _id: 'b', roles: [{ codeRol: 'ADM' }] },
        ]),
      );

      const result = await service.findActiveByTenant(
        { company: 'EmpX', tenantId: 'EmpX', isSuperAdmin: false },
        true,
      );

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ _id: 'a' });
    });

    it('sin user solo filtra activos', async () => {
      mockUserModel.find.mockReturnValue(leanExec([{ _id: 'a' }]));

      const result = await service.findActiveByTenant(undefined, false);

      expect(mockUserModel.find).toHaveBeenCalledWith({ isActived: true, deletedAt: null });
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findByPage', () => {
    it('pagina y filtra por global', async () => {
      mockUserModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(leanExec([{ _id: 'a' }])),
        }),
      });
      mockUserModel.countDocuments.mockReturnValue(exec(3));

      const result = await service.findByPage(
        { isSuperAdmin: false, company: 'EmpX' },
        0,
        10,
        'juan',
      );

      expect(result.meta.totalData).toBe(3);
      expect(result.data).toHaveLength(1);
      expect(mockUserModel.countDocuments).toHaveBeenCalled();
    });

    it('pagina sin global ni límites', async () => {
      mockUserModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(leanExec([{ _id: 'a' }])),
        }),
      });
      mockUserModel.countDocuments.mockReturnValue(exec(1));

      const result = await service.findByPage({ isSuperAdmin: true });

      expect(result.meta.totalData).toBe(1);
    });

    it('aplica filtros avanzados combinados', async () => {
      mockUserModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(leanExec([])),
        }),
      });
      mockUserModel.countDocuments.mockReturnValue(exec(0));

      await service.findByPage(
        { isSuperAdmin: true },
        0,
        10,
        '',
        JSON.stringify({ estado: 'true', rol: 'ADM' }),
      );

      expect(mockUserModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          isActived: true,
          $and: expect.arrayContaining([
            expect.objectContaining({ $or: expect.any(Array) }),
          ]),
        }),
      );
    });
  });

  describe('findByPagination', () => {
    it('pagina simple', async () => {
      mockUserModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue(leanExec([{ _id: 'a' }])),
        }),
      });
      mockUserModel.countDocuments.mockReturnValue(exec(1));

      const result = await service.findByPagination(
        { company: 'EmpX', isSuperAdmin: false },
        1,
        10,
      );

      expect(result.data).toHaveLength(1);
      expect(result.meta.page).toBe(1);
    });
  });

  describe('findOne', () => {
    it('devuelve el usuario sanitizado', async () => {
      mockUserModel.findOne.mockReturnValueOnce(
        leanExec({ _id: 'a', password: 'x' }),
      );

      const result = await service.findOne('a');

      expect(result).not.toHaveProperty('password');
    });

    it('lanza NotFound si no existe', async () => {
      mockUserModel.findOne.mockReturnValueOnce(leanExec(null));

      await expect(service.findOne('a')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByDate', () => {
    it('devuelve usuarios por rango de fechas', async () => {
      mockUserModel.find.mockReturnValue(leanExec([{ _id: 'a' }]));

      const result = await service.findByDate(
        { company: 'EmpX', isSuperAdmin: false },
        '2025-01-01',
        '2025-01-02',
      );

      expect(result.data).toHaveLength(1);
    });

    it('lanza si faltan fechas', async () => {
      await expect(service.findByDate({}, '', '')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('lanza NotFound si no hay resultados', async () => {
      mockUserModel.find.mockReturnValue(leanExec([]));

      await expect(
        service.findByDate({}, '2025-01-01', '2025-01-02'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza y sanitiza', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue(
        leanExec({ _id: 'a', name: 'Nuevo', password: 'x' }),
      );

      const result = await service.update('a', { name: 'Nuevo' } as any);

      expect(result).not.toHaveProperty('password');
      expect(result).toMatchObject({ name: 'Nuevo' });
    });

    it('lanza NotFound si no existe', async () => {
      mockUserModel.findByIdAndUpdate.mockReturnValue(leanExec(null));

      await expect(service.update('a', {} as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('elimina y sanitiza', async () => {
      mockUserModel.findByIdAndDelete.mockReturnValue(
        leanExec({ _id: 'a', password: 'x' }),
      );

      const result = await service.remove('a');

      expect(result).not.toHaveProperty('password');
    });

    it('lanza NotFound si no existe', async () => {
      mockUserModel.findByIdAndDelete.mockReturnValue(leanExec(null));

      await expect(service.remove('a')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProfile', () => {
    it('devuelve perfil sin password', async () => {
      mockUserModel.findById.mockReturnValue(
        leanExec({
          _id: 'a',
          name: 'Juan',
          password: 'x',
          modules: [],
          roles: [],
          permissions: [],
        }),
      );

      const result = await service.getProfile({ _id: 'a' });

      expect(result.data.user).not.toHaveProperty('password');
      expect(result.data.modules).toEqual([]);
    });

    it('lanza NotFound si no existe', async () => {
      mockUserModel.findById.mockReturnValue(leanExec(null));

      await expect(service.getProfile({ _id: 'a' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserModules/getUserRoles/getUserPermissions', () => {
    it.each(['modules', 'roles', 'permissions'])(
      'devuelve el campo %s',
      async (field) => {
        mockUserModel.findById.mockReturnValue({
          select: jest.fn().mockReturnValue(
            leanExec({ _id: 'a', [field]: [{ name: 'x' }] }),
          ),
        });

        const method =
          field === 'modules'
            ? 'getUserModules'
            : field === 'roles'
              ? 'getUserRoles'
              : 'getUserPermissions';
        const result = await (service as any)[method]({ _id: 'a' });

        expect(result.data).toHaveLength(1);
      },
    );

    it('lanza NotFound si el usuario no existe', async () => {
      mockUserModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue(leanExec(null)),
      });

      await expect(service.getUserModules({ _id: 'a' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
