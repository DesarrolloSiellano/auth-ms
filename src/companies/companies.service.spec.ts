import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesService } from './companies.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: 'c1', id: 'c1', toObject: () => data }),
  }));
  mockModel.find = jest.fn();
  mockModel.findOne = jest.fn();
  mockModel.findById = jest.fn();
  mockModel.findByIdAndUpdate = jest.fn();
  mockModel.findByIdAndDelete = jest.fn();
  mockModel.countDocuments = jest.fn();

  const tenantConfigMock = {
    ensureConfig: jest.fn().mockResolvedValue(true),
  };

  function leanExec(value: any) {
    return { lean: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(value) }) };
  }
  function exec(value: any) {
    return { exec: jest.fn().mockResolvedValue(value) };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompaniesService,
        { provide: getModelToken('Company'), useValue: mockModel },
        { provide: TenantConfigService, useValue: tenantConfigMock },
      ],
    }).compile();

    service = module.get<CompaniesService>(CompaniesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crea una compañía y devuelve formato estándar', async () => {
      const result = await service.create({ name: 'EmpresaX', isActive: true } as any);
      expect(result.message).toContain('created');
      expect(result.meta.id).toBe('c1');
    });

    it('crea la configuración de políticas por defecto del nuevo tenant', async () => {
      await service.create({ name: 'EmpresaX', id: '0000001' } as any);
      expect(tenantConfigMock.ensureConfig).toHaveBeenCalledWith(
        'c1',
        'EmpresaX',
      );
    });
  });

  describe('findAll', () => {
    it('devuelve las compañías', async () => {
      mockModel.find.mockReturnValue(leanExec([{ _id: 'c1' }]));
      await expect(service.findAll()).resolves.toEqual([{ _id: 'c1' }]);
    });

    it('lanza NotFound si no hay', async () => {
      mockModel.find.mockReturnValue(leanExec([]));
      await expect(service.findAll()).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPage', () => {
    it('pagina con global', async () => {
      mockModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanExec([{ _id: 'c1' }])) }),
      });
      mockModel.countDocuments.mockResolvedValue(3);

      const result = await service.findByPage(0, 10, 'emp');
      expect(result.data).toHaveLength(1);
      expect(result.meta.totalData).toBe(3);
    });

    it('pagina sin global', async () => {
      mockModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanExec([])) }),
      });
      mockModel.countDocuments.mockResolvedValue(0);

      const result = await service.findByPage(undefined, undefined, undefined);
      expect(result.data).toEqual([]);
    });
  });

  describe('findByAutoComplete', () => {
    it('devuelve vacío sin palabra', async () => {
      const result = await service.findByAutoComplete();
      expect(result.data).toEqual([]);
      expect(result.message).toContain('No search word');
    });

    it('busca todas las coincidencias por palabra', async () => {
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue(leanExec([{ name: 'a' }])),
      });

      const result = await service.findByAutoComplete('a');
      expect(result.data).toEqual([{ name: 'a' }]);
      expect(result.meta.totalData).toBe(1);
    });
  });

  describe('findOne', () => {
    it('devuelve la compañía', async () => {
      mockModel.findById.mockReturnValue(leanExec({ _id: 'c1' }));
      await expect(service.findOne('c1')).resolves.toEqual({ _id: 'c1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findById.mockReturnValue(leanExec(null));
      await expect(service.findOne('c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkAvailability', () => {
    it('detecta nombre y RUT/NIT existentes', async () => {
      mockModel.findOne
        .mockReturnValueOnce(leanExec({ _id: 'c1' }))
        .mockReturnValueOnce(leanExec(null));

      const result = await service.checkAvailability({
        name: 'EmpresaX',
        id: '900',
      });

      expect(result.data).toEqual({ nameExists: true, idExists: false });
      expect(mockModel.findOne).toHaveBeenCalledWith({ name: 'EmpresaX' });
      expect(mockModel.findOne).toHaveBeenCalledWith({ id: '900' });
    });

    it('omite la propia compañía con excludeId', async () => {
      mockModel.findOne.mockReturnValue(leanExec(null));

      const result = await service.checkAvailability({
        name: 'EmpresaX',
        excludeId: 'c1',
      });

      expect(result.data.nameExists).toBe(false);
      expect(mockModel.findOne).toHaveBeenCalledWith({
        _id: { $ne: 'c1' },
        name: 'EmpresaX',
      });
    });
  });

  describe('update', () => {
    it('actualiza y devuelve formato estándar', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(
        exec({ _id: 'c1', email: 'x@y.com' }),
      );
      const result = await service.update('c1', { email: 'x@y.com' } as any);
      expect(result.meta.id).toBe('c1');
    });

    it('no permite cambiar name ni id (identidad del tenant)', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec({ _id: 'c1' }));

      await service.update('c1', {
        name: 'Otro',
        id: '999',
        phone: '1',
      } as any);

      const payload = mockModel.findByIdAndUpdate.mock.calls[0][1];
      expect(payload).toEqual({ phone: '1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec(null));
      await expect(service.update('c1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('elimina la compañía', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec({ _id: 'c1' }));
      await expect(service.remove('c1')).resolves.toEqual({ _id: 'c1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec(null));
      await expect(service.remove('c1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('block/unblock', () => {
    function lastSet() {
      const calls = mockModel.findByIdAndUpdate.mock.calls;
      return calls[calls.length - 1][1].$set;
    }

    it('bloquea con fecha (temporal) y motivo', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(
        leanExec({ _id: 'c1', isBlocked: true }),
      );
      const until = new Date(Date.now() + 60_000).toISOString();

      const result = await service.block('c1', { reason: 'mora', until });

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          $set: expect.objectContaining({
            isBlocked: true,
            blockReason: 'mora',
          }),
        }),
        { new: true },
      );
      expect(lastSet().blockedUntil).toBeInstanceOf(Date);
      expect(result.message).toContain('blocked');
    });

    it('bloquea sin fecha (indefinido)', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(
        leanExec({ _id: 'c1', isBlocked: true, blockedUntil: null }),
      );

      await service.block('c1', {});

      expect(lastSet().blockedUntil).toBeNull();
    });

    it('lanza NotFound al bloquear una compañía inexistente', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(leanExec(null));
      await expect(service.block('c1', {})).rejects.toThrow(NotFoundException);
    });

    it('desbloquea la compañía', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(
        leanExec({ _id: 'c1', isBlocked: false }),
      );

      const result = await service.unblock('c1');

      expect(lastSet()).toMatchObject({
        isBlocked: false,
        blockReason: null,
        blockedUntil: null,
      });
      expect(result.message).toContain('unblocked');
    });
  });
});
