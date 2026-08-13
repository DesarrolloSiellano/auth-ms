import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { MailService } from 'src/mail/mail.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

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

  const mockUserModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({
      ...data,
      _id: 'new-id',
      toObject: () => data,
    }),
  }));
  mockUserModel.find = jest.fn();
  mockUserModel.findById = jest.fn();
  mockUserModel.findByIdAndUpdate = jest.fn();
  mockUserModel.findByIdAndDelete = jest.fn();
  mockUserModel.countDocuments = jest.fn();

  const mailServiceMock = { sendEmail: jest.fn().mockResolvedValue(undefined) };

  function leanExec(value: any) {
    return {
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }),
    };
  }
  function exec(value: any) {
    return { exec: jest.fn().mockResolvedValue(value) };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('Rol'), useValue: {} },
        { provide: getModelToken('Permission'), useValue: {} },
        { provide: getModelToken('Module'), useValue: {} },
        { provide: MailService, useValue: mailServiceMock },
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

      expect(mockUserModel.find).toHaveBeenCalledWith({ company: 'EmpX' });
      expect(result[0]).not.toHaveProperty('password');
    });

    it('no filtra si es superadmin', async () => {
      mockUserModel.find.mockReturnValue(leanExec([{ _id: 'a' }]));

      await service.findAll({ company: 'EmpX', isSuperAdmin: true });

      expect(mockUserModel.find).toHaveBeenCalledWith({});
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

      expect(mockUserModel.find).toHaveBeenCalledWith({ isActived: true });
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
      mockUserModel.findById.mockReturnValue(leanExec({ _id: 'a', password: 'x' }));

      const result = await service.findOne('a');

      expect(result).not.toHaveProperty('password');
    });

    it('lanza NotFound si no existe', async () => {
      mockUserModel.findById.mockReturnValue(leanExec(null));

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
