import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AuditService } from './audit.service';

function queryChain(value: any) {
  const chain: any = {};
  ['setOptions', 'select', 'sort', 'skip', 'limit', 'lean'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });
  chain.exec = jest.fn().mockResolvedValue(value);
  return chain;
}

describe('AuditService', () => {
  let service: AuditService;
  const mockModel: any = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getModelToken('AuditLog'), useValue: mockModel },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it('registra un evento con estado por defecto success', async () => {
    mockModel.create.mockResolvedValue({});
    await service.log({ action: 'login.success', category: 'auth' });
    expect(mockModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'login.success', status: 'success' }),
    );
  });

  it('no registra eventos de bajo valor', async () => {
    await service.log({ action: 'refresh', category: 'auth' });
    await service.log({ action: 'user.filters.saved', category: 'user' });
    expect(mockModel.create).not.toHaveBeenCalled();
  });

  it('no lanza si falla el registro', async () => {
    mockModel.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.log({ action: 'login.failed', category: 'auth' }),
    ).resolves.toBeUndefined();
  });

  it('findMine pagina, filtra por usuario y rango de fechas', async () => {
    mockModel.find.mockReturnValue(queryChain([{ _id: 'a1', userId: 'u1' }]));
    mockModel.countDocuments.mockReturnValue(queryChain(42));

    const result = await service.findMine('u1', {
      page: 2,
      limit: 20,
      category: 'auth',
      from: '2026-01-01',
      to: '2026-01-31',
    });

    expect(mockModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        category: 'auth',
        createdAt: {
          $gte: new Date('2026-01-01'),
          $lte: new Date('2026-01-31T23:59:59.999Z'),
        },
      }),
    );
    expect(result.data).toHaveLength(1);
    expect(result.meta).toEqual({ totalData: 42, page: 2, limit: 20 });
  });

  it('findForReport acota por empresa a no-SuperAdmin y pagina', async () => {
    mockModel.find.mockReturnValue(queryChain([]));
    mockModel.countDocuments.mockReturnValue(queryChain(0));

    const result = await service.findForReport(
      {},
      { isSuperAdmin: false, company: 'BPONET' },
    );

    expect(mockModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'BPONET' }),
    );
    expect(result.total).toBe(0);
  });

  it('findForReport no acota a SuperAdmin y permite export all', async () => {
    mockModel.find.mockReturnValue(queryChain([{ _id: 'x' }]));

    const result = await service.findForReport(
      { status: 'failed' },
      { isSuperAdmin: true },
      { all: true },
    );

    expect(mockModel.find).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed' }),
    );
    expect(result.data).toHaveLength(1);
  });
});
