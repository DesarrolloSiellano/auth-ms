import { IdempotencyService } from './idempotency.service';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

describe('IdempotencyService', () => {
  let service: IdempotencyService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue(data),
  }));
  mockModel.findOne = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        { provide: getModelToken('Idempotency'), useValue: mockModel },
      ],
    }).compile();

    service = module.get<IdempotencyService>(IdempotencyService);
  });

  it('busca una clave existente', async () => {
    const record = { key: 'abc123', method: 'POST', path: '/x' };
    mockModel.findOne.mockReturnValue({
      lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(record) }),
    });

    await expect(service.findKey('abc123', 'POST', '/x')).resolves.toEqual(
      record,
    );
    expect(mockModel.findOne).toHaveBeenCalledWith({
      key: 'abc123',
      method: 'POST',
      path: '/x',
    });
  });

  it('guarda una nueva clave', async () => {
    await service.saveKey('abc123', 'POST', '/x', { ok: true });

    expect(mockModel).toHaveBeenCalled();
    expect(mockModel.mock.results[0].value.save).toHaveBeenCalled();
  });

  it('ignora errores de duplicado (11000)', async () => {
    const err: any = new Error('dup');
    err.code = 11000;
    mockModel.mockImplementationOnce(() => ({
      save: jest.fn().mockRejectedValue(err),
    }));

    await expect(
      service.saveKey('abc123', 'POST', '/x', { ok: true }),
    ).resolves.toBeUndefined();
  });

  it('repropaga errores que no son de duplicado', async () => {
    const err = new Error('db down');
    mockModel.mockImplementationOnce(() => ({
      save: jest.fn().mockRejectedValue(err),
    }));

    await expect(
      service.saveKey('abc123', 'POST', '/x', { ok: true }),
    ).rejects.toThrow('db down');
  });
});
