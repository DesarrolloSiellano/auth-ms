import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SessionsService } from './sessions.service';

function queryChain(value: any) {
  const chain: any = {};
  ['setOptions', 'select', 'sort', 'skip', 'limit', 'lean'].forEach((method) => {
    chain[method] = jest.fn().mockReturnValue(chain);
  });
  chain.exec = jest.fn().mockResolvedValue(value);
  return chain;
}

describe('SessionsService - autoservicio', () => {
  let service: SessionsService;
  const mockModel: any = { find: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionsService,
        { provide: getModelToken('Session'), useValue: mockModel },
      ],
    }).compile();
    service = module.get(SessionsService);
  });

  it('findMine lista sesiones activas del usuario', async () => {
    mockModel.find.mockReturnValue(queryChain([{ _id: 's1', user: 'u1' }]));

    const result = await service.findMine('u1');

    expect(mockModel.find).toHaveBeenCalledWith({ user: 'u1', isActive: true });
    expect(result.data).toHaveLength(1);
  });

  it('revokeMine ignora ids inválidos', async () => {
    const result = await service.revokeMine('u1', 'no-es-objectid');
    expect(result).toBeNull();
    expect(mockModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('revokeMine revoca validando pertenencia', async () => {
    const id = '507f1f77bcf86cd799439011';
    mockModel.findOneAndUpdate.mockReturnValue(queryChain({ _id: id }));

    const result = await service.revokeMine('u1', id);

    expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: id, user: 'u1', isActive: true },
      { $set: { isActive: false } },
      { new: true },
    );
    expect(result).toEqual({ _id: id });
  });

  it('revokeAllMine devuelve el total revocado', async () => {
    mockModel.find.mockReturnValue(queryChain([{ _id: 's1' }, { _id: 's2' }]));
    mockModel.updateMany.mockReturnValue(queryChain({ modifiedCount: 2 }));

    const revoked = await service.revokeAllMine('u1');

    expect(revoked).toBe(2);
  });
});
