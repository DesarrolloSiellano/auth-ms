import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ForbiddenException } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';

describe('CompaniesController', () => {
  let controller: CompaniesController;
  const superAdminReq = { user: { isSuperAdmin: true } };
  const serviceMock = {
    create: jest.fn(),
    findAll: jest.fn(),
    findByPage: jest.fn(),
    findByAutoComplete: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [CompaniesController],
      providers: [{ provide: CompaniesService, useValue: serviceMock }],
    }).compile();

    controller = module.get<CompaniesController>(CompaniesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delega (SuperAdmin)', () => {
    serviceMock.create.mockReturnValue('ok');
    expect(controller.create({ name: 'X' } as any, superAdminReq)).toBe('ok');
  });

  it('create rechaza a no-SuperAdmin', () => {
    expect(() =>
      controller.create({ name: 'X' } as any, {
        user: { isSuperAdmin: false },
      }),
    ).toThrow(ForbiddenException);
  });

  it('findAll delega (SuperAdmin)', () => {
    serviceMock.findAll.mockReturnValue('list');
    expect(controller.findAll(superAdminReq)).toBe('list');
  });

  it('findAll rechaza a no-SuperAdmin', () => {
    expect(() =>
      controller.findAll({ user: { isSuperAdmin: false } }),
    ).toThrow(ForbiddenException);
  });

  it('findByPage delega con defaults', () => {
    serviceMock.findByPage.mockReturnValue('page');
    expect(
      controller.findByPage(undefined, undefined, undefined, superAdminReq),
    ).toBe('page');
  });

  it('findByAutoComplete delega (abierto a usuarios)', () => {
    serviceMock.findByAutoComplete.mockReturnValue('ac');
    expect(controller.findByAutoComplete('emp')).toBe('ac');
  });

  it('findOne delega', () => {
    serviceMock.findOne.mockReturnValue('one');
    expect(controller.findOne('c1', superAdminReq)).toBe('one');
  });

  it('update delega', () => {
    serviceMock.update.mockReturnValue('upd');
    expect(controller.update('c1', { name: 'N' } as any, superAdminReq)).toBe(
      'upd',
    );
  });

  it('remove delega', () => {
    serviceMock.remove.mockReturnValue('del');
    expect(controller.remove('c1', superAdminReq)).toBe('del');
  });

  it('tcpPatternsDoc devuelve documentación', () => {
    const result = controller.tcpPatternsDoc();
    expect(result.patterns.length).toBeGreaterThan(0);
  });

  it('msCreate delega', () => {
    void controller.msCreate({ name: 'X' } as any);
    expect(serviceMock.create).toHaveBeenCalledWith({ name: 'X' });
  });

  it('msFindAll delega', () => {
    void controller.msFindAll();
    expect(serviceMock.findAll).toHaveBeenCalled();
  });

  it('msFindOne soporta objeto o string', () => {
    void controller.msFindOne({ id: 'c1', serviceKey: 'k' });
    expect(serviceMock.findOne).toHaveBeenCalledWith('c1');

    void controller.msFindOne('c2');
    expect(serviceMock.findOne).toHaveBeenCalledWith('c2');
  });

  it('msUpdate delega', () => {
    void controller.msUpdate({ id: 'c1', updateCompanyDto: { name: 'N' } });
    expect(serviceMock.update).toHaveBeenCalledWith('c1', { name: 'N' });
  });

  it('msRemove soporta objeto o string', () => {
    void controller.msRemove({ id: 'c1', serviceKey: 'k' });
    expect(serviceMock.remove).toHaveBeenCalledWith('c1');

    void controller.msRemove('c2');
    expect(serviceMock.remove).toHaveBeenCalledWith('c2');
  });
});
