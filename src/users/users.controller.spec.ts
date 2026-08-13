import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let controller: UsersController;

  const usersServiceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findActiveByTenant: jest.fn(),
    findByPage: jest.fn(),
    findByPagination: jest.fn(),
    findOne: jest.fn(),
    findByDate: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    getProfile: jest.fn(),
    getUserModules: jest.fn(),
    getUserRoles: jest.fn(),
    getUserPermissions: jest.fn(),
    createExternal: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersServiceMock },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('crea un usuario si el autenticado es admin', () => {
      usersServiceMock.create.mockReturnValue('ok');
      const result = controller.create({} as any, { user: { isAdmin: true } });

      expect(usersServiceMock.create).toHaveBeenCalled();
      expect(result).toBe('ok');
    });

    it('rechaza si el autenticado no es admin', () => {
      expect(() =>
        controller.create({} as any, { user: { isAdmin: false } }),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('findAll / findByPage', () => {
    it('findAll delega en el servicio', () => {
      usersServiceMock.findAll.mockReturnValue('list');
      expect(controller.findAll({ user: { company: 'X' } })).toBe('list');
      expect(usersServiceMock.findAll).toHaveBeenCalledWith({ company: 'X' });
    });

    it('findByPage delega con números y global', () => {
      usersServiceMock.findByPage.mockReturnValue('page');
      const result = controller.findByPage(
        { user: { company: 'X' } },
        'X',
        '5',
        '25',
        'juan',
      );
      expect(usersServiceMock.findByPage).toHaveBeenCalledWith(
        { company: 'X' },
        5,
        25,
        'juan',
      );
      expect(result).toBe('page');
    });
  });

  describe('findByTenant', () => {
    it('delega con usuario normal', () => {
      usersServiceMock.findActiveByTenant.mockReturnValue('list');
      const result = controller.findByTenant(
        { user: { company: 'X' } },
        'true',
      );
      expect(usersServiceMock.findActiveByTenant).toHaveBeenCalledWith(
        { company: 'X' },
        'true',
      );
      expect(result).toBe('list');
    });

    it('exige company/tenant en llamadas de servicio', () => {
      expect(() =>
        controller.findByTenant({ user: { isService: true } }, ''),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('profile', () => {
    it('usa el _id del token para llamadas de usuario', () => {
      usersServiceMock.getProfile.mockReturnValue('profile');
      const result = controller.profile({ user: { _id: 'u1' } }, undefined);
      expect(usersServiceMock.getProfile).toHaveBeenCalledWith({ _id: 'u1' });
      expect(result).toBe('profile');
    });

    it('usa x-user-id para llamadas de servicio', () => {
      usersServiceMock.getProfile.mockReturnValue('profile');
      const result = controller.profile(
        { user: { isService: true }, headers: { 'x-user-id': 'svc-user' } },
        undefined,
      );
      expect(usersServiceMock.getProfile).toHaveBeenCalledWith({
        _id: 'svc-user',
      });
      expect(result).toBe('profile');
    });

    it('rechaza llamadas de servicio sin target', () => {
      expect(() =>
        controller.profile({ user: { isService: true }, headers: {} }, undefined),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('profile/modules|roles|permissions', () => {
    it.each([
      ['profileModules', 'getUserModules'],
      ['profileRoles', 'getUserRoles'],
      ['profilePermissions', 'getUserPermissions'],
    ])('%s delega en el servicio', (method, serviceMethod) => {
      (usersServiceMock as any)[serviceMethod].mockReturnValue('data');
      const result = (controller as any)[method](
        { user: { _id: 'u1' } },
        undefined,
      );
      expect((usersServiceMock as any)[serviceMethod]).toHaveBeenCalledWith({
        _id: 'u1',
      });
      expect(result).toBe('data');
    });
  });

  describe('findByDate / findById', () => {
    it('findByDate delega con fechas', () => {
      usersServiceMock.findByDate.mockReturnValue('dates');
      const result = controller.findByDate(
        { user: { company: 'X' } },
        '2025-01-01',
        '2025-01-02',
      );
      expect(usersServiceMock.findByDate).toHaveBeenCalledWith(
        { company: 'X' },
        '2025-01-01',
        '2025-01-02',
      );
      expect(result).toBe('dates');
    });

    it('findById delega con el id', () => {
      usersServiceMock.findOne.mockReturnValue('user');
      expect(controller.findById('abc')).toBe('user');
      expect(usersServiceMock.findOne).toHaveBeenCalledWith('abc');
    });
  });

  describe('update / remove', () => {
    it('update exige admin y delega', () => {
      usersServiceMock.update.mockReturnValue('updated');
      const result = controller.update('abc', {} as any, {
        user: { isAdmin: true },
      });
      expect(usersServiceMock.update).toHaveBeenCalledWith('abc', {});
      expect(result).toBe('updated');
    });

    it('update rechaza no-admin', () => {
      expect(() =>
        controller.update('abc', {} as any, { user: { isAdmin: false } }),
      ).toThrow(UnauthorizedException);
    });

    it('remove exige admin y delega', () => {
      usersServiceMock.remove.mockReturnValue('removed');
      expect(controller.remove('abc', { user: { isAdmin: true } })).toBe(
        'removed',
      );
    });

    it('remove rechaza no-admin', () => {
      expect(() =>
        controller.remove('abc', { user: { isAdmin: false } }),
      ).toThrow(UnauthorizedException);
    });
  });

  describe('tcpPatternsDoc', () => {
    it('devuelve la documentación de patrones', () => {
      const result = controller.tcpPatternsDoc();
      expect(result.message).toContain('Comandos TCP');
      expect(result.patterns.length).toBeGreaterThan(0);
    });
  });

  describe('handlers TCP', () => {
    it('msCreateExternal delega', () => {
      void controller.msCreateExternal({ foo: 'bar' });
      expect(usersServiceMock.createExternal).toHaveBeenCalledWith({ foo: 'bar' });
    });

    it('msCreate delega', () => {
      void controller.msCreate({ name: 'Juan' } as any);
      expect(usersServiceMock.create).toHaveBeenCalledWith({ name: 'Juan' });
    });

    it('msFindAll delega con el usuario', () => {
      void controller.msFindAll({ user: { company: 'X' } });
      expect(usersServiceMock.findAll).toHaveBeenCalledWith({ company: 'X' });
    });

    it('msFindByTenant delega con onlyAgents', () => {
      void controller.msFindByTenant({ user: { company: 'X' }, onlyAgents: true });
      expect(usersServiceMock.findActiveByTenant).toHaveBeenCalledWith(
        { company: 'X' },
        true,
      );
    });

    it('msFindByPagination delega con defaults', () => {
      void controller.msFindByPagination({ user: { company: 'X' } });
      expect(usersServiceMock.findByPagination).toHaveBeenCalledWith(
        { company: 'X' },
        1,
        10,
      );
    });

    it('msFindById soporta payload objeto o string', () => {
      void controller.msFindById({ id: 'abc', serviceKey: 'k' });
      expect(usersServiceMock.findOne).toHaveBeenCalledWith('abc');

      void controller.msFindById('def');
      expect(usersServiceMock.findOne).toHaveBeenCalledWith('def');
    });

    it('msGetUserProfile delega', () => {
      void controller.msGetUserProfile({ _id: 'u1' });
      expect(usersServiceMock.getProfile).toHaveBeenCalledWith({ _id: 'u1' });
    });

    it('msFindByDate delega con fechas', () => {
      void controller.msFindByDate({ user: { company: 'X' }, startDate: 'a', endDate: 'b' });
      expect(usersServiceMock.findByDate).toHaveBeenCalledWith(
        { company: 'X' },
        'a',
        'b',
      );
    });

    it('msUpdate delega', () => {
      void controller.msUpdate({ id: 'abc', updateUserDto: { name: 'X' } });
      expect(usersServiceMock.update).toHaveBeenCalledWith('abc', {
        name: 'X',
      });
    });

    it('msRemove soporta payload objeto o string', () => {
      void controller.msRemove({ id: 'abc', serviceKey: 'k' });
      expect(usersServiceMock.remove).toHaveBeenCalledWith('abc');

      void controller.msRemove('def');
      expect(usersServiceMock.remove).toHaveBeenCalledWith('def');
    });
  });
});
