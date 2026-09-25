import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';

import { MassiveUsersService } from './massive-users.service';
import { MailService } from 'src/mail/mail.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

function buildExcel(
  rows: Record<string, any>[],
  sheetName = 'Usuarios',
): any {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx',
  }) as Buffer;
  return { originalname: 'usuarios.xlsx', buffer };
}

function chainResolved(value: any) {
  const chain: any = {};
  chain.setOptions = jest.fn().mockReturnValue(chain);
  chain.select = jest.fn().mockReturnValue(chain);
  chain.lean = jest.fn().mockReturnValue(chain);
  chain.exec = jest.fn().mockResolvedValue(value);
  return chain;
}

const baseRow = {
  Nombres: 'Juan',
  Apellidos: 'Pérez',
  'Correo Electrónico': 'juan@mail.com',
  Teléfono: '3001234567',
  Usuario: 'juanp',
  TenantId: '000000',
  Empresa: 'BPONET',
  Roles: 'USR',
  Permisos: 'Crear',
  Módulos: 'adminUserModule',
};

describe('MassiveUsersService', () => {
  let service: MassiveUsersService;

  let userSave: jest.Mock;
  let userModel: any;
  let companyModel: any;
  let mailService: { sendEmail: jest.Mock };
  let tenantConfigServiceMock: { getPolicyValue: jest.Mock };

  let existingEmails: Set<string>;
  let existingPhones: Set<string>;
  let existingUsernames: Set<string>;
  let companies: { name: string; id: string }[];

  const superAdmin = { _id: 'admin', isSuperAdmin: true };

  beforeEach(async () => {
    existingEmails = new Set<string>();
    existingPhones = new Set<string>();
    existingUsernames = new Set<string>();
    companies = [{ name: 'BPONET', id: '000000' }];

    userSave = jest.fn().mockResolvedValue(true);

    userModel = jest.fn().mockImplementation((data: any) => ({
      ...data,
      save: userSave,
    }));
    userModel.findOne = jest.fn((filter: any) => {
      if (filter?.email) {
        return chainResolved(
          existingEmails.has(filter.email) ? { email: filter.email } : null,
        );
      }
      if (filter?.phone) {
        return chainResolved(
          existingPhones.has(filter.phone) ? { phone: filter.phone } : null,
        );
      }
      if (filter?.username) {
        return chainResolved(
          existingUsernames.has(filter.username)
            ? { username: filter.username }
            : null,
        );
      }
      return chainResolved(null);
    });

    companyModel = {
      find: jest.fn(() => chainResolved(companies)),
    };

    const rolModel = {
      findOne: jest.fn((filter: any) => {
        const value = String(
          filter?.codeRol?.source || filter?.name?.source || '',
        )
          .replace(/^\^|\$$/g, '')
          .toUpperCase();
        const roles: Record<string, any> = {
          USR: { name: 'Usuario Básico', codeRol: 'USR', permissions: [] },
          ADM: { name: 'Administrador', codeRol: 'ADM', permissions: [] },
        };
        return chainResolved(
          roles[value] && roles[value].codeRol === value ? roles[value] : null,
        );
      }),
    };

    const permissionModel = {
      findOne: jest.fn((filter: any) => {
        const value = String(
          filter?.name?.source || filter?.action?.source || '',
        )
          .replace(/^\^|\$$/g, '')
          .toLowerCase();
        const perms: Record<string, any> = {
          crear: { name: 'Crear', action: 'create', isActive: true },
        };
        return chainResolved(perms[value] || null);
      }),
    };

    const moduleModel = {
      findOne: jest.fn((filter: any) => {
        const value = String(filter?.name?.source || '')
          .replace(/^\^|\$$/g, '')
          .toLowerCase();
        return chainResolved(
          value === 'adminusermodule'
            ? { name: 'adminUserModule', isActive: true, routes: [] }
            : null,
        );
      }),
    };

    mailService = { sendEmail: jest.fn().mockResolvedValue(undefined) };
    tenantConfigServiceMock = {
      getPolicyValue: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MassiveUsersService,
        { provide: getModelToken('User'), useValue: userModel },
        { provide: getModelToken('Rol'), useValue: rolModel },
        { provide: getModelToken('Permission'), useValue: permissionModel },
        { provide: getModelToken('Module'), useValue: moduleModel },
        { provide: getModelToken('Company'), useValue: companyModel },
        { provide: MailService, useValue: mailService },
        {
          provide: TenantConfigService,
          useValue: tenantConfigServiceMock,
        },
      ],
    }).compile();

    service = module.get<MassiveUsersService>(MassiveUsersService);
  });

  it('rechaza cuando no hay archivo', async () => {
    await expect(service.processExcel(undefined, superAdmin)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rechaza extensiones no permitidas', async () => {
    await expect(
      service.processExcel(
        { originalname: 'usuarios.pdf', buffer: Buffer.from('x') },
        superAdmin,
      ),
    ).rejects.toThrow('El archivo debe tener formato Excel');
  });

  it('rechaza un archivo vacío', async () => {
    await expect(
      service.processExcel(
        { originalname: 'usuarios.xlsx', buffer: Buffer.from('') },
        superAdmin,
      ),
    ).rejects.toThrow('El archivo está vacío');
  });

  it('rechaza cuando faltan columnas obligatorias', async () => {
    const file = buildExcel([{ Nombres: 'Juan' }]);
    await expect(service.processExcel(file, superAdmin)).rejects.toThrow(
      'Faltan columnas obligatorias',
    );
  });

  it('rechaza más de 50 usuarios', async () => {
    const rows = Array.from({ length: 51 }, (_, i) => ({
      ...baseRow,
      'Correo Electrónico': `user${i}@mail.com`,
      Teléfono: `30000000${i}`,
      Usuario: `user${i}`,
    }));
    const file = buildExcel(rows);
    await expect(service.processExcel(file, superAdmin)).rejects.toThrow(
      'El límite de carga es de 50 usuarios',
    );
  });

  it('ignora filas vacías o con solo espacios (no cuentan para el límite)', async () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({
      ...baseRow,
      'Correo Electrónico': `user${i}@mail.com`,
      Teléfono: `30000000${i}`,
      Usuario: `user${i}`,
    }));
    rows.push({
      'Nombres': ' ',
      'Apellidos': '',
      'Correo Electrónico': ' ',
      Teléfono: '',
      Usuario: '',
      TenantId: '',
      Empresa: '',
      Roles: '',
      Permisos: '',
      Módulos: '',
    });

    const file = buildExcel(rows);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.total).toBe(50);
    expect(result.data.created).toBe(50);
    expect(result.data.failed).toBe(0);
  });

  it('crea un usuario con isAdmin/isSuperAdmin false y envía correo', async () => {
    const file = buildExcel([baseRow]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    expect(result.data.failed).toBe(0);
    expect(userSave).toHaveBeenCalledTimes(1);
    const created = userModel.mock.calls[0][0];
    expect(created.isAdmin).toBe(false);
    expect(created.isSuperAdmin).toBe(false);
    expect(created.company).toBe('BPONET');
    expect(created.tenantId).toBe('000000');
    expect(created.password).toBeTruthy();
    expect(mailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('ignora columnas Admin/SuperAdmin del archivo (siempre false)', async () => {
    const row = {
      ...baseRow,
      Admin: 'si',
      SuperAdmin: 'si',
      isAdmin: true,
      isSuperAdmin: true,
    };
    const file = buildExcel([row]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    const created = userModel.mock.calls[0][0];
    expect(created.isAdmin).toBe(false);
    expect(created.isSuperAdmin).toBe(false);
  });

  it('limite 0 = ilimitado: crea sin consultar el conteo', async () => {
    tenantConfigServiceMock.getPolicyValue.mockResolvedValue(0);
    userModel.countDocuments = jest.fn();

    const file = buildExcel([baseRow]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    expect(result.data.failed).toBe(0);
    expect(userModel.countDocuments).not.toHaveBeenCalled();
  });

  it('bloquea filas cuando se alcanza limits.maxUsers', async () => {
    tenantConfigServiceMock.getPolicyValue.mockResolvedValue(2);
    userModel.countDocuments = jest.fn().mockReturnValue({
      setOptions: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(2),
      }),
    });

    const rows = [
      { ...baseRow },
      {
        ...baseRow,
        'Correo Electrónico': 'b@mail.com',
        Usuario: 'b',
        Teléfono: '3111111111',
      },
    ];
    const file = buildExcel(rows);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(0);
    expect(result.data.failed).toBe(2);
    expect(result.data.results[0].message).toContain('máximo de usuarios');
  });

  it('marca como existing un correo ya registrado', async () => {
    existingEmails.add('juan@mail.com');
    const file = buildExcel([baseRow]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.existing).toBe(1);
    expect(result.data.created).toBe(0);
    expect(userSave).not.toHaveBeenCalled();
  });

  it('rechaza usuario ya registrado (global)', async () => {
    existingUsernames.add('juanp');
    const file = buildExcel([baseRow]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.failed).toBe(1);
    expect(result.data.results[0].message).toContain('usuario ya está registrado');
  });

  it('un error en una fila no detiene el resto del proceso', async () => {
    const rows = [
      { ...baseRow, 'Correo Electrónico': 'correo-invalido' },
      {
        ...baseRow,
        'Correo Electrónico': 'maria@mail.com',
        Usuario: 'marial',
        Teléfono: '3100000000',
      },
    ];
    const file = buildExcel(rows);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.failed).toBe(1);
    expect(result.data.created).toBe(1);
    expect(userSave).toHaveBeenCalledTimes(1);
  });

  it('crea el usuario aunque roles/permisos/módulos no existan (los omite)', async () => {
    const file = buildExcel([
      {
        ...baseRow,
        Roles: 'ROL_INEXISTENTE',
        Permisos: 'PermisoInexistente',
        Módulos: 'ModuloInexistente',
      },
    ]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    expect(result.data.failed).toBe(0);
    const created = userModel.mock.calls[0][0];
    expect(created.roles).toEqual([]);
    expect(created.permissions).toEqual([]);
    expect(created.modules).toEqual([]);
  });

  it('mantiene los roles/permisos/módulos válidos y omite los inválidos', async () => {
    const file = buildExcel([
      {
        ...baseRow,
        Roles: 'USR;ROL_INEXISTENTE',
        Permisos: 'Crear;PermisoInexistente',
        Módulos: 'adminUserModule;ModuloInexistente',
      },
    ]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    const created = userModel.mock.calls[0][0];
    expect(created.roles).toHaveLength(1);
    expect(created.roles[0].codeRol).toBe('USR');
    expect(created.permissions).toHaveLength(1);
    expect(created.permissions[0].name).toBe('Crear');
    expect(created.modules).toHaveLength(1);
    expect(created.modules[0].name).toBe('adminUserModule');
  });

  it('detecta correos duplicados dentro del archivo', async () => {
    const rows = [
      baseRow,
      { ...baseRow, Usuario: 'juanp2', Teléfono: '3111111111' },
    ];
    const file = buildExcel(rows);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    expect(result.data.failed).toBe(1);
    expect(result.data.results[1].message).toContain('duplicado');
  });

  it('permite teléfonos repetidos (phone no es único)', async () => {
    const rows = [
      baseRow,
      {
        ...baseRow,
        'Correo Electrónico': 'otro@mail.com',
        Usuario: 'otro',
      },
    ];
    const file = buildExcel(rows);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(2);
    expect(result.data.failed).toBe(0);
  });

  it('normaliza el username a minúsculas', async () => {
    const file = buildExcel([{ ...baseRow, Usuario: 'JuanP' }]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.created).toBe(1);
    const created = userModel.mock.calls[0][0];
    expect(created.username).toBe('juanp');
  });

  it('rechaza empresa inexistente/no correspondiente (SuperAdmin)', async () => {
    const file = buildExcel([
      { ...baseRow, Empresa: 'NO_EXISTE', TenantId: '999' },
    ]);
    const result = await service.processExcel(file, superAdmin);

    expect(result.data.failed).toBe(1);
    expect(result.data.created).toBe(0);
    expect(result.data.results[0].message).toContain('La empresa no existe');
  });

  it('un admin no-Super usa su propia empresa/tenant ignorando el Excel', async () => {
    const admin = {
      _id: 'admin',
      isAdmin: true,
      isSuperAdmin: false,
      company: 'MIEMPRESA',
      tenantId: 'MIEMPRESA-ID',
    };
    const file = buildExcel([baseRow]);
    const result = await service.processExcel(file, admin);

    expect(result.data.created).toBe(1);
    const created = userModel.mock.calls[0][0];
    expect(created.company).toBe('MIEMPRESA');
    expect(created.tenantId).toBe('MIEMPRESA-ID');
    expect(created.isAdmin).toBe(false);
    expect(companyModel.find).not.toHaveBeenCalled();
  });

  it('permite a un admin no-Super un archivo sin columnas Empresa/TenantId', async () => {
    const admin = {
      _id: 'admin',
      isAdmin: true,
      isSuperAdmin: false,
      company: 'MIEMPRESA',
      tenantId: 'MIEMPRESA-ID',
    };
    const row = {
      Nombres: 'Ana',
      Apellidos: 'Gómez',
      'Correo Electrónico': 'ana@mail.com',
      Teléfono: '3200000000',
      Usuario: 'ana',
      Roles: '',
      Permisos: '',
      Módulos: '',
    };
    const file = buildExcel([row]);
    const result = await service.processExcel(file, admin);

    expect(result.data.created).toBe(1);
    const created = userModel.mock.calls[0][0];
    expect(created.company).toBe('MIEMPRESA');
    expect(created.tenantId).toBe('MIEMPRESA-ID');
  });
});
