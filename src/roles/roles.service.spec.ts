import { Test, TestingModule } from '@nestjs/testing';
import { RolesService } from './roles.service';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';

describe('RolesService', () => {
  let service: RolesService;

  const mockModel: any = jest.fn().mockImplementation((data: any) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: 'r1', toObject: () => data }),
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
        skip: jest.fn().mockReturnValue({ limit: jest.fn().mockReturnValue(leanExec([{ _id: 'r1' }])) }),
      }),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: getModelToken('Rol'), useValue: mockModel },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('crea un rol y devuelve formato estándar', async () => {
      const result = await service.create({ name: 'Admin', codeRol: 'ADM' } as any);
      expect(result.message).toContain('created');
      expect(result.meta.id).toBe('r1');
    });
  });

  describe('findAll', () => {
    it('devuelve los roles', async () => {
      mockModel.find.mockReturnValue(leanExec([{ _id: 'r1' }]));
      await expect(service.findAll()).resolves.toEqual([{ _id: 'r1' }]);
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

      const result = await service.findByPage(0, 10, 'admin');
      expect(result.meta.totalData).toBe(3);
    });

    it('pagina sin global', async () => {
      mockModel.find.mockReturnValue(selectChain());
      mockModel.countDocuments.mockReturnValue(exec(0));

      await expect(service.findByPage()).resolves.toEqual(
        expect.objectContaining({ data: [{ _id: 'r1' }] }),
      );
    });
  });

  describe('findOne', () => {
    it('devuelve el rol', async () => {
      mockModel.findById.mockReturnValue(leanExec({ _id: 'r1' }));
      await expect(service.findOne('r1')).resolves.toEqual({ _id: 'r1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findById.mockReturnValue(leanExec(null));
      await expect(service.findOne('r1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('actualiza y devuelve formato estándar', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec({ _id: 'r1', name: 'Nuevo' }));
      const result = await service.update('r1', { name: 'Nuevo' } as any);
      expect(result.meta.id).toBe('r1');
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndUpdate.mockReturnValue(exec(null));
      await expect(service.update('r1', {} as any)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('elimina el rol', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec({ _id: 'r1' }));
      await expect(service.remove('r1')).resolves.toEqual({ _id: 'r1' });
    });

    it('lanza NotFound', async () => {
      mockModel.findByIdAndDelete.mockReturnValue(exec(null));
      await expect(service.remove('r1')).rejects.toThrow(NotFoundException);
    });
  });
});
