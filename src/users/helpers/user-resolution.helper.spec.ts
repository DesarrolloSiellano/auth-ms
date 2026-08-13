import {
  resolveUserRoles,
  resolveUserPermissions,
  resolveUserModules,
} from './user-resolution.helper';

describe('resolveUserRoles', () => {
  let rolModel: any;

  beforeEach(() => {
    rolModel = jest.fn().mockImplementation((data: any) => ({
      ...data,
      save: jest.fn().mockResolvedValue(data),
    }));
    rolModel.find = jest.fn();
  });

  it('resuelve roles existentes a partir de códigos en string', async () => {
    rolModel.find.mockReturnValue({
      exec: jest.fn().mockResolvedValue([
        {
          name: 'Admin',
          codeRol: 'ADM',
          description: 'd',
          isActive: true,
          isInheritPermissions: false,
          permissions: [],
        },
      ]),
    });

    const result = await resolveUserRoles({ roles: ['ADM'] }, rolModel);

    expect(rolModel.find).toHaveBeenCalledWith({ codeRol: { $in: ['ADM'] } });
    expect(result).toEqual([
      expect.objectContaining({ codeRol: 'ADM', name: 'Admin' }),
    ]);
  });

  it('acepta roles como objetos', async () => {
    rolModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

    const result = await resolveUserRoles(
      { roles: [{ roleCode: 'USR', roleName: 'Usuario' }] },
      rolModel,
    );

    expect(rolModel).toHaveBeenCalled();
    expect(result).toEqual([expect.objectContaining({ codeRol: 'USR' })]);
  });

  it('soporta payload.roleCode singular', async () => {
    rolModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

    const result = await resolveUserRoles({ roleCode: 'AGE' }, rolModel);

    expect(result).toEqual([expect.objectContaining({ codeRol: 'AGE' })]);
  });

  it('devuelve [] si hay un error', async () => {
    rolModel.find.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(resolveUserRoles({ roles: ['ADM'] }, rolModel)).resolves.toEqual(
      [],
    );
  });
});

describe('resolveUserPermissions', () => {
  let permissionModel: any;

  beforeEach(() => {
    permissionModel = jest.fn().mockImplementation((data: any) => ({
      ...data,
      save: jest.fn().mockResolvedValue({
        ...data,
        name: data.name,
      }),
    }));
    permissionModel.findOne = jest.fn();
  });

  it('agrega un permiso existente activo', async () => {
    permissionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        name: 'Crear',
        description: 'd',
        action: 'create',
        isActive: true,
      }),
    });

    const result = await resolveUserPermissions(
      { permissions: ['crear'] },
      permissionModel,
    );

    expect(result).toEqual([
      expect.objectContaining({ name: 'Crear', action: 'create' }),
    ]);
  });

  it('crea el permiso si no existe tras la segunda verificación', async () => {
    permissionModel.findOne
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) });

    const result = await resolveUserPermissions(
      { permissions: ['read'] },
      permissionModel,
    );

    expect(permissionModel).toHaveBeenCalled();
    expect(result).toEqual([expect.objectContaining({ action: 'read' })]);
  });

  it('omite permisos inactivos', async () => {
    permissionModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        name: 'X',
        description: 'd',
        action: 'x',
        isActive: false,
      }),
    });

    const result = await resolveUserPermissions(
      { permissions: ['x'] },
      permissionModel,
    );

    expect(result).toEqual([]);
  });

  it('devuelve [] si hay un error', async () => {
    permissionModel.findOne.mockReturnValue({
      exec: jest.fn().mockRejectedValue(new Error('db down')),
    });

    await expect(
      resolveUserPermissions({ permissions: ['read'] }, permissionModel),
    ).resolves.toEqual([]);
  });
});

describe('resolveUserModules', () => {
  let moduleModel: any;

  beforeEach(() => {
    moduleModel = { findOne: jest.fn(), find: jest.fn() };
  });

  const globalModule = {
    _id: 'm1',
    name: 'mod',
    routes: [
      {
        name: 'R1',
        path: '/r1',
        children: [{ name: 'C1', path: '/r1/c1' }],
      },
      { name: 'R2', path: '/r2', children: [] },
    ],
  };

  it('filtra rutas según allowedRoutes (parent allowed incluye hijos)', async () => {
    moduleModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(globalModule) }),
    });

    const result = await resolveUserModules(
      { allowNameModule: 'mod', allowedRoutes: ['/r1', '/r1/c1'] },
      moduleModel,
    );

    expect(result[0].routes).toHaveLength(1);
    expect(result[0].routes[0]).toMatchObject({ path: '/r1' });
    expect(result[0].routes[0].children).toHaveLength(1);
  });

  it('filtra rutas según modules[].routes', async () => {
    moduleModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(globalModule) }),
    });

    const result = await resolveUserModules(
      {
        modules: [
          {
            name: 'mod',
            routes: [{ path: '/r1', isActive: true, children: [{ path: '/r1/c1' }] }],
          },
        ],
      },
      moduleModel,
    );

    expect(result).toHaveLength(1);
    expect(result[0].routes).toHaveLength(1);
  });

  it('agrega el módulo completo si el payload no trae rutas', async () => {
    moduleModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(globalModule) }),
    });

    const result = await resolveUserModules({ modules: [{ name: 'mod' }] }, moduleModel);

    expect(result).toEqual([globalModule]);
  });

  it('agrega el payload si el módulo no existe', async () => {
    moduleModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    });

    const result = await resolveUserModules(
      { modules: [{ name: 'missing' }] },
      moduleModel,
    );

    expect(result).toEqual([{ name: 'missing' }]);
  });

  it('usa los módulos activos como fallback cuando no hay coincidencias', async () => {
    moduleModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    });
    moduleModel.find.mockReturnValue({
      lean: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ name: 'active' }]),
      }),
    });

    const result = await resolveUserModules({}, moduleModel);

    expect(result).toEqual([{ name: 'active' }]);
  });

  it('devuelve [] si hay un error', async () => {
    moduleModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockRejectedValue(new Error('x')) }),
    });

    await expect(resolveUserModules({ allowedRoutes: ['/r1'] }, moduleModel)).resolves.toEqual(
      [],
    );
  });
});
