import { Test, TestingModule } from '@nestjs/testing';
import { SessionsService } from './sessions.service';
import { getModelToken } from '@nestjs/mongoose';

function queryChain(value: any) {
  const chain: any = {};
  ['setOptions', 'select', 'sort', 'skip', 'limit', 'lean'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });
  chain.exec = jest.fn().mockResolvedValue(value);
  return chain;
}

describe('SessionsService', () => {
  let service: SessionsService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  mockModel.findOne = jest.fn();
  mockModel.findOneAndUpdate = jest.fn();
  mockModel.updateOne = jest.fn();
  mockModel.updateMany = jest.fn();
  mockModel.find = jest.fn();
  mockModel.countDocuments = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: getModelToken('Session'), useValue: mockModel },
      ],
    }).compile();

    service = module.get<SessionsService>(SessionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('crea una sesión con lastActivityAt', async () => {
    const result: any = await service.createSession({
      user: 'abc123',
      refreshToken: 'hash',
    } as any);

    expect(mockModel).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'abc123', lastActivityAt: expect.any(Date) }),
    );
    expect(result).toMatchObject({ user: 'abc123' });
  });

  it('busca una sesión activa por hash de refresh token', async () => {
    const session = { _id: 's1', refreshToken: 'hash', isActive: true };
    mockModel.findOne.mockReturnValue(queryChain(session));

    await expect(service.findActiveByRefreshHash('hash')).resolves.toEqual(
      session,
    );
    expect(mockModel.findOne).toHaveBeenCalledWith({
      refreshToken: 'hash',
      isActive: true,
    });
  });

  it('isSessionActive devuelve false para un id inválido', async () => {
    await expect(service.isSessionActive('no-es-objectid')).resolves.toBe(false);
    expect(mockModel.findOne).not.toHaveBeenCalled();
  });

  it('isSessionActive consulta la BD y usa caché', async () => {
    mockModel.findOne.mockReturnValue(queryChain({ _id: '507f1f77bcf86cd799439011' }));

    const first = await service.isSessionActive('507f1f77bcf86cd799439011');
    const second = await service.isSessionActive('507f1f77bcf86cd799439011');

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(mockModel.findOne).toHaveBeenCalledTimes(1);
  });

  it('revokeById invalida la caché de sesión', async () => {
    const session = { _id: '507f1f77bcf86cd799439011', isActive: true };
    mockModel.findOne.mockReturnValue(queryChain({ _id: session._id }));
    mockModel.findOneAndUpdate.mockReturnValue(queryChain(session));

    await service.isSessionActive(session._id);
    await service.revokeById(session._id);

    // Tras revocar, la caché se limpia y se vuelve a consultar (devuelve activa de nuevo en el mock)
    mockModel.findOne.mockReturnValue(queryChain(null));
    await service.isSessionActive(session._id);

    expect(mockModel.findOne).toHaveBeenCalledTimes(2);
  });

  it('revokeByUser desactiva todas y devuelve el total', async () => {
    mockModel.find.mockReturnValue(queryChain([{ _id: 's1' }, { _id: 's2' }]));
    mockModel.updateMany.mockReturnValue(queryChain({ modifiedCount: 2 }));

    const revoked = await service.revokeByUser('u1', 'EmpresaX');

    expect(revoked).toBe(2);
    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { user: 'u1', isActive: true, company: 'EmpresaX' },
      { $set: { isActive: false } },
    );
  });

  it('findActiveSessions filtra por empresa y pagina', async () => {
    mockModel.find.mockReturnValue(queryChain([{ _id: 's1' }]));
    mockModel.countDocuments.mockReturnValue(queryChain(1));

    const result = await service.findActiveSessions({
      company: 'EmpresaX',
      from: 0,
      limit: 10,
    });

    expect(result.data).toHaveLength(1);
    expect(result.meta.totalData).toBe(1);
  });

  it('purga entradas expiradas de la caché', () => {
    const cache = (service as any).activeCache;
    cache.set('expired', { active: false, expiresAt: Date.now() - 1 });
    cache.set('live', { active: true, expiresAt: Date.now() + 10000 });

    (service as any).purgeExpired();

    expect(cache.has('expired')).toBe(false);
    expect(cache.has('live')).toBe(true);
  });

  it('limpia la caché al destruir el módulo', () => {
    const cache = (service as any).activeCache;
    cache.set('x', { active: true, expiresAt: Date.now() + 1000 });

    service.onModuleDestroy();

    expect(cache.size).toBe(0);
  });
});
