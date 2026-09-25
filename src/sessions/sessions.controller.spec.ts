import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

describe('SessionsController', () => {
  let controller: SessionsController;
  const serviceMock = {
    findActiveSessions: jest.fn(),
    revokeById: jest.fn(),
    revokeByUser: jest.fn(),
    revokeMany: jest.fn(),
    revokeAll: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 10 }])],
      controllers: [SessionsController],
      providers: [{ provide: SessionsService, useValue: serviceMock }],
    }).compile();

    controller = module.get<SessionsController>(SessionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rechaza a usuarios sin permisos', () => {
    expect(() =>
      controller.findAll({ user: { isAdmin: false, isSuperAdmin: false } }),
    ).toThrow(ForbiddenException);
  });

  it('lista sesiones acotadas a la empresa del admin', () => {
    serviceMock.findActiveSessions.mockReturnValue('list');
    const result = controller.findAll({
      user: { isAdmin: true, isSuperAdmin: false, company: 'EmpresaX' },
    });
    expect(result).toBe('list');
    expect(serviceMock.findActiveSessions).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'EmpresaX' }),
    );
  });

  it('el superadmin no tiene filtro de empresa', () => {
    serviceMock.findActiveSessions.mockReturnValue('list');
    void controller.findAll({ user: { isSuperAdmin: true } });
    expect(serviceMock.findActiveSessions).toHaveBeenCalledWith(
      expect.objectContaining({ company: undefined }),
    );
  });

  it('revoca una sesión por id', async () => {
    serviceMock.revokeById.mockResolvedValue({ _id: 's1' });
    const result = await controller.revokeById('s1', {
      user: { isSuperAdmin: true },
    });
    expect(result.data).toEqual({ _id: 's1' });
  });

  it('lanza NotFound si la sesión no existe', async () => {
    serviceMock.revokeById.mockResolvedValue(null);
    await expect(
      controller.revokeById('s1', { user: { isSuperAdmin: true } }),
    ).rejects.toThrow(NotFoundException);
  });

  it('revoca un lote de sesiones', async () => {
    serviceMock.revokeMany.mockResolvedValue(2);
    const result = await controller.revokeMany(
      { ids: ['a', 'b'] },
      { user: { isSuperAdmin: true } },
    );
    expect(result.data).toEqual({ revoked: 2 });
  });

  it('revoca todas las sesiones', async () => {
    serviceMock.revokeAll.mockResolvedValue(5);
    const result = await controller.revokeAll({ user: { isSuperAdmin: true } });
    expect(result.data).toEqual({ revoked: 5 });
  });
});
