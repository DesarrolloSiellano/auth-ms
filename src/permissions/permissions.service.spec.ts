import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsService } from './permissions.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

describe('PermissionsService', () => {
  let service: PermissionsService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: 'p1', toObject: () => data }),
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
  function selectChain() {
    return {
      select: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanExec([{ _id: 'p1' }])) }),
      }),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: getModelToken('Permission'), useValue: mockModel },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crea un permiso y devuelve formato estándar', async () => {
      const result = await service.create({ name: 'Crear', action: 'create' } as any);
      expect(result.message).toContain('created');
      expect(result.meta.id).toBe('p1');
    });
  });

  describe('findAll', () => {
    it('devuelve los permisos', async () => {
      mockModel.find.mockReturnValue(leanExec([{ _id: 'p1' }]));
      await expect(service.findAll()).resolves.toEqual([{ _id: 'p1' }]);
    });

    it('lanza NotFound si no hay', async () => {
      mockModel.find.mockReturnValue(leanExec([]));
      await expect(service.findAll()).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByPage', () => {
    it('pagina con global y countDocuments().exec()', async () => {
      mockModel.find.mockReturnValue(selectChain());
      mockModel.countDocuments.mockReturnValue(exec(3));

      const result = await service.findByPage(0, 10, 'crear');
      expect(result.meta.totalData).toBe(3);
    });

    it('pagina sin global', async () => {
      mockModel.find.mockReturnValue(selectChain());
      mockModel.countDocuments.mockReturnValue(exec(0));

      await expect(service.findByPage()).resolves.toEqual(
        expect.objectContaining({ data: [{ _id: 'p1' }] }),
      );
    });
  });

  describe('findOne', () => {
    it('devuelve el permiso', async () => {
      mockModel.findById.mockReturnValue(leanExec({ _id: 'p1' }));
      await expect(service.findOne('p1')).resolves.toEqual({ _id: 'p1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findById.mockReturnValue(leanExec(null));
      await expect(service.findOne('p1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza y devuelve formato estándar', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec({ _id: 'p1', name: 'Nuevo' }));
      const result = await service.update('p1', { name: 'Nuevo' } as any);
      expect(result.meta.id).toBe('p1');
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec(null));
      await expect(service.update('p1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('elimina el permiso', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec({ _id: 'p1' }));
      await expect(service.remove('p1')).resolves.toEqual({ _id: 'p1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec(null));
      await expect(service.remove('p1')).rejects.toThrow(NotFoundException);
    });
  });
});
