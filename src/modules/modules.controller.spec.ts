import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { UnauthorizedException } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

describe('ModulesController', () => {
  let controller: ModulesController;
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
      controllers: [ModulesController],
      providers: [{ provide: ModulesService, useValue: serviceMock }],
    }).compile();

    controller = module.get<ModulesController>(ModulesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create exige admin y delega', () => {
    serviceMock.create.mockReturnValue('ok');
    expect(controller.create({} as any, { user: { isAdmin: true } })).toBe('ok');
    expect(serviceMock.create).toHaveBeenCalledWith({});
  });

  it('create rechaza no-admin', () => {
    expect(() => controller.create({} as any, { user: { isAdmin: false } })).toThrow(
      UnauthorizedException,
    );
  });

  it('findAll exige admin y delega', () => {
    serviceMock.findAll.mockReturnValue('list');
    expect(controller.findAll({ user: { isAdmin: true } })).toBe('list');
  });

  it('findAll rechaza no-admin', () => {
    expect(() => controller.findAll({ user: { isAdmin: false } })).toThrow(
      UnauthorizedException,
    );
  });

  it('findByPage delega con defaults', () => {
    serviceMock.findByPage.mockReturnValue('page');
    expect(controller.findByPage(undefined, undefined, undefined)).toBe('page');
  });

  it('findOne delega', () => {
    serviceMock.findOne.mockReturnValue('one');
    expect(controller.findOne('m1')).toBe('one');
  });

  it('update delega', () => {
    serviceMock.update.mockReturnValue('upd');
    expect(controller.update('m1', { name: 'N' } as any)).toBe('upd');
  });

  it('remove delega', () => {
    serviceMock.remove.mockReturnValue('del');
    expect(controller.remove('m1')).toBe('del');
  });

  it('tcpPatternsDoc devuelve documentación', () => {
    const result = controller.tcpPatternsDoc();
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('msCreate delega', () => {
    void controller.msCreate({ name: 'M' } as any);
    expect(serviceMock.create).toHaveBeenCalledWith({ name: 'M' });
  });

  it('msFindAll delega', () => {
    void controller.msFindAll();
    expect(serviceMock.findAll).toHaveBeenCalled();
  });

  it('msFindOne soporta objeto o string', () => {
    void controller.msFindOne({ id: 'm1', serviceKey: 'k' });
    expect(serviceMock.findOne).toHaveBeenCalledWith('m1');

    void controller.msFindOne('m2');
    expect(serviceMock.findOne).toHaveBeenCalledWith('m2');
  });

  it('msUpdate delega', () => {
    void controller.msUpdate({ id: 'm1', updateModuleDto: { name: 'N' } });
    expect(serviceMock.update).toHaveBeenCalledWith('m1', { name: 'N' });
  });

  it('msRemove soporta objeto o string', () => {
    void controller.msRemove({ id: 'm1', serviceKey: 'k' });
    expect(serviceMock.remove).toHaveBeenCalledWith('m1');

    void controller.msRemove('m2');
    expect(serviceMock.remove).toHaveBeenCalledWith('m2');
  });
});
