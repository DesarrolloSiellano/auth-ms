import { Test, TestingModule } from '@nestjs/testing';
import { ModulesService } from './modules.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

describe('ModulesService', () => {
  let service: ModulesService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: 'm1', toObject: () => data }),
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
        ModulesService,
        { provide: getModelToken('Module'), useValue: mockModel },
      ],
    }).compile();

    service = module.get<ModulesService>(ModulesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crea un módulo y devuelve formato estándar', async () => {
      const result = await service.create({ name: 'Mod', description: 'd' } as any);
      expect(result.message).toContain('created');
      expect(result.meta.id).toBe('m1');
    });

    it('lanza NotFound si no se crea', async () => {
      mockModel.mockImplementationOnce(() => ({
        save: jest.fn().mockResolvedValue(null),
      }));
      await expect(
        service.create({ name: 'Mod' } as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('devuelve los módulos', async () => {
      mockModel.find.mockReturnValue(leanExec([{ _id: 'm1' }]));
      await expect(service.findAll()).resolves.toEqual([{ _id: 'm1' }]);
    });

    it('lanza NotFound si no hay', async () => {
      mockModel.find.mockReturnValue(leanExec(null));
      await expect(service.findAll()).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPage', () => {
    it('pagina con global', async () => {
      mockModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanExec([{ _id: 'm1' }])) }),
      });
      mockModel.countDocuments.mockResolvedValue(3);

      const result = await service.findByPage(0, 10, 'mod');
      expect(result.meta.totalData).toBe(3);
    });

    it('pagina sin global', async () => {
      mockModel.find.mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanExec([])) }),
      });
      mockModel.countDocuments.mockResolvedValue(0);

      await expect(service.findByPage()).resolves.toEqual(
        expect.objectContaining({ data: [] }),
      );
    });
  });

  describe('findOne', () => {
    it('devuelve el módulo', async () => {
      mockModel.findById.mockReturnValue(leanExec({ _id: 'm1' }));
      await expect(service.findOne('m1')).resolves.toEqual({ _id: 'm1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findById.mockReturnValue(leanExec(null));
      await expect(service.findOne('m1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza y devuelve formato estándar', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec({ _id: 'm1', name: 'Nuevo' }));
      const result = await service.update('m1', { name: 'Nuevo' } as any);
      expect(result.meta.id).toBe('m1');
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec(null));
      await expect(service.update('m1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('elimina el módulo', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec({ _id: 'm1' }));
      await expect(service.remove('m1')).resolves.toEqual({ _id: 'm1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec(null));
      await expect(service.remove('m1')).rejects.toThrow(NotFoundException);
    });
  });
});
