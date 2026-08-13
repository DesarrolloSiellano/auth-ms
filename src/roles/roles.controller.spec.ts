import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

describe('RolesController', () => {
  let controller: RolesController;
  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByPage: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [RolesController],
      providers: [{ provide: RolesService, useValue: serviceMock }],
    }).compile();

    controller = module.get<RolesController>(RolesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delega', () => {
    serviceMock.create.mockReturnValue('ok');
    expect(controller.create({ name: 'Admin' } as any)).toBe('ok');
  });

  it('findAll delega', () => {
    serviceMock.findAll.mockReturnValue('list');
    expect(controller.findAll()).toBe('list');
  });

  it('findByPage delega', () => {
    serviceMock.findByPage.mockReturnValue('page');
    expect(controller.findByPage(undefined, undefined, undefined)).toBe('page');
  });

  it('findOne delega', () => {
    serviceMock.findOne.mockReturnValue('one');
    expect(controller.findOne('r1')).toBe('one');
  });

  it('update delega', () => {
    serviceMock.update.mockReturnValue('upd');
    expect(controller.update('r1', { name: 'N' } as any)).toBe('upd');
  });

  it('remove delega', () => {
    serviceMock.remove.mockReturnValue('del');
    expect(controller.remove('r1')).toBe('del');
  });

  it('tcpPatternsDoc devuelve documentación', () => {
    const result = controller.tcpPatternsDoc();
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('msCreate delega', () => {
    void controller.msCreate({ name: 'R' } as any);
    expect(serviceMock.create).toHaveBeenCalledWith({ name: 'R' });
  });

  it('msFindAll delega', () => {
    void controller.msFindAll();
    expect(serviceMock.findAll).toHaveBeenCalled();
  });

  it('msFindOne soporta objeto o string', () => {
    void controller.msFindOne({ id: 'r1', serviceKey: 'k' });
    expect(serviceMock.findOne).toHaveBeenCalledWith('r1');

    void controller.msFindOne('r2');
    expect(serviceMock.findOne).toHaveBeenCalledWith('r2');
  });

  it('msUpdate delega', () => {
    void controller.msUpdate({ id: 'r1', updateRoleDto: { name: 'N' } });
    expect(serviceMock.update).toHaveBeenCalledWith('r1', { name: 'N' });
  });

  it('msRemove soporta objeto o string', () => {
    void controller.msRemove({ id: 'r1', serviceKey: 'k' });
    expect(serviceMock.remove).toHaveBeenCalledWith('r1');

    void controller.msRemove('r2');
    expect(serviceMock.remove).toHaveBeenCalledWith('r2');
  });
});
