import { Test, TestingModule } from '@nestjs/testing';
import { CompaniesService } from './companies.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

describe('CompaniesService', () => {
  let service: CompaniesService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: 'c1', toObject: () => data }),
  }));
  mockModel.find = jest.fn();
  mockModel.findById = jest.fn();
  mockModel.findByIdAndUpdate = jest.fn();
  mockModel.findByIdAndDelete = jest.fn();
  mockModel.countDocuments = jest.fn();

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

    it('busca por palabra limitando a 10', async () => {
      mockModel.find.mockReturnValue({
        limit: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue(leanExec([{ name: 'a' }])) }),
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

  describe('update', () => {
    it('actualiza y devuelve formato estándar', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec({ _id: 'c1', name: 'Nuevo' }));
      const result = await service.update('c1', { name: 'Nuevo' } as any);
      expect(result.meta.id).toBe('c1');
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
});
