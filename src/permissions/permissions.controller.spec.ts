import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

describe('PermissionsController', () => {
  let controller: PermissionsController;
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
      controllers: [PermissionsController],
      providers: [{ provide: PermissionsService, useValue: serviceMock }],
    }).compile();

    controller = module.get<PermissionsController>(PermissionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delega', () => {
    serviceMock.create.mockReturnValue('ok');
    expect(controller.create({ name: 'Crear' } as any)).toBe('ok');
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
    expect(controller.findOne('p1')).toBe('one');
  });

  it('update delega', () => {
    serviceMock.update.mockReturnValue('upd');
    expect(controller.update('p1', { name: 'N' } as any)).toBe('upd');
  });

  it('remove delega', () => {
    serviceMock.remove.mockReturnValue('del');
    expect(controller.remove('p1')).toBe('del');
  });

  it('tcpPatternsDoc devuelve documentación', () => {
    const result = controller.tcpPatternsDoc();
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('msCreate delega', () => {
    void controller.msCreate({ name: 'P' } as any);
    expect(serviceMock.create).toHaveBeenCalledWith({ name: 'P' });
  });

  it('msFindAll delega', () => {
    void controller.msFindAll();
    expect(serviceMock.findAll).toHaveBeenCalled();
  });

  it('msFindOne soporta objeto o string', () => {
    void controller.msFindOne({ id: 'p1', serviceKey: 'k' });
    expect(serviceMock.findOne).toHaveBeenCalledWith('p1');

    void controller.msFindOne('p2');
    expect(serviceMock.findOne).toHaveBeenCalledWith('p2');
  });

  it('msUpdate delega', () => {
    void controller.msUpdate({ id: 'p1', updatePermissionDto: { name: 'N' } });
    expect(serviceMock.update).toHaveBeenCalledWith('p1', { name: 'N' });
  });

  it('msRemove soporta objeto o string', () => {
    void controller.msRemove({ id: 'p1', serviceKey: 'k' });
    expect(serviceMock.remove).toHaveBeenCalledWith('p1');

    void controller.msRemove('p2');
    expect(serviceMock.remove).toHaveBeenCalledWith('p2');
  });
});
