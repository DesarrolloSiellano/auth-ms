import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TenantConfigService } from './tenant-config.service';

function lean(value: any) {
  return { lean: () => ({ exec: () => Promise.resolve(value) }) };
}
function sortLean(value: any) {
  return {
    sort: () => ({ lean: () => ({ exec: () => Promise.resolve(value) }) }),
  };
}

describe('TenantConfigService', () => {
  let service: TenantConfigService;
  let policyDefinitionModel: any;
  let tenantConfigModel: any;
  let tenantUsageModel: any;
  let tenantUsageReportModel: any;

  const definitions = [
    {
      key: 'features.pbx',
      group: 'features',
      type: 'boolean',
      defaultValue: false,
    },
    {
      key: 'channels.sms.monthlyLimit',
      group: 'channels',
      type: 'number',
      defaultValue: 3000,
      min: 0,
      max: null,
    },
    {
      key: 'channels.whatsapp.enabled',
      group: 'channels',
      type: 'boolean',
      defaultValue: false,
    },
    {
      key: 'channels.whatsapp.monthlyLimit',
      group: 'channels',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: null,
    },
    {
      key: 'messages.bolsa.utilidad',
      group: 'messages',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: null,
    },
    {
      key: 'messages.bolsa.marketingComercial',
      group: 'messages',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: null,
    },
    {
      key: 'messages.bolsa.autenticacion',
      group: 'messages',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: null,
    },
    {
      key: 'messages.bolsa.servicio',
      group: 'messages',
      type: 'number',
      defaultValue: 0,
      min: 0,
      max: null,
    },
  ];

  beforeEach(async () => {
    policyDefinitionModel = {
      find: jest.fn().mockReturnValue({
        sort: () => lean(definitions),
        lean: () => ({ exec: () => Promise.resolve(definitions) }),
      }),
      findOne: jest.fn(),
      create: jest.fn().mockResolvedValue({ toObject: () => ({}) }),
      findOneAndUpdate: jest.fn(),
      findOneAndDelete: jest.fn(),
      updateOne: jest.fn().mockReturnValue({
        exec: () => Promise.resolve({ modifiedCount: 0 }),
      }),
      deleteOne: jest.fn().mockReturnValue({
        exec: () => Promise.resolve({ deletedCount: 0 }),
      }),
    };
    tenantConfigModel = {
      find: jest.fn().mockReturnValue(sortLean([])),
      findOne: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockReturnValue({
        exec: () => Promise.resolve({ modifiedCount: 0 }),
      }),
    };
    tenantUsageModel = {
      find: jest.fn().mockReturnValue(sortLean([])),
      findOneAndUpdate: jest.fn(),
    };
    tenantUsageReportModel = {
      create: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantConfigService,
        {
          provide: getModelToken('PolicyDefinition'),
          useValue: policyDefinitionModel,
        },
        { provide: getModelToken('TenantConfig'), useValue: tenantConfigModel },
        { provide: getModelToken('TenantUsage'), useValue: tenantUsageModel },
        {
          provide: getModelToken('TenantUsageReport'),
          useValue: tenantUsageReportModel,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('false') },
        },
      ],
    }).compile();

    service = module.get<TenantConfigService>(TenantConfigService);
  });

  it('isEmbedEnabled respeta el flag false', () => {
    expect(service.isEmbedEnabled()).toBe(false);
  });

  it('resolveConfig aplica defaults y valores guardados (anidado)', async () => {
    tenantConfigModel.findOne.mockReturnValue({
      lean: () => ({
        exec: () =>
          Promise.resolve({
            tenantId: '0000000',
            company: 'BPONET',
            version: 2,
            values: { 'features.pbx': true },
          }),
      }),
    });

    const result = await service.resolveConfig('0000000', 'BPONET');

    expect(result.data.version).toBe(2);
    expect(result.data.features.pbx).toBe(true);
    expect(result.data.channels.sms.monthlyLimit).toBe(3000);
  });

  it('resolveConfig usa defaults cuando no hay config', async () => {
    tenantConfigModel.findOne.mockReturnValue(lean(null));

    const result = await service.resolveConfig('0000000');

    expect(result.data.features.pbx).toBe(false);
    expect(result.data.channels.sms.monthlyLimit).toBe(3000);
    expect(result.data.version).toBe(0);
  });

  it('upsertConfig crea la config validando valores', async () => {
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });
    tenantConfigModel.create.mockImplementation((data: any) => ({
      toObject: () => data,
    }));

    const result = await service.upsertConfig({
      tenantId: '0000000',
      company: 'BPONET',
      values: { 'features.pbx': true, 'channels.sms.monthlyLimit': '1500' },
    });

    expect(tenantConfigModel.create).toHaveBeenCalled();
    expect(result.data.channels.sms.monthlyLimit).toBe(1500);
    expect(result.data.features.pbx).toBe(true);
  });

  it('upsertConfig ignora políticas desconocidas', async () => {
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });
    tenantConfigModel.create.mockImplementation((data: any) => ({
      toObject: () => data,
    }));

    const result = await service.upsertConfig({
      tenantId: '0000000',
      values: { 'desconocida.x': 1, 'features.pbx': true },
    });

    expect(result.data.values['desconocida.x']).toBeUndefined();
    expect(result.data.features.pbx).toBe(true);
  });

  it('upsertConfig rechaza valores de tipo inválido', async () => {
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });

    await expect(
      service.upsertConfig({
        tenantId: '0000000',
        values: { 'features.pbx': 'no-booleano' },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upsertConfig reparte las bolsas al cambiar la bolsa global de WhatsApp', async () => {
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });
    tenantConfigModel.create.mockImplementation((data: any) => ({
      toObject: () => data,
    }));

    const result = await service.upsertConfig({
      tenantId: '0000000',
      values: {
        'channels.whatsapp.enabled': true,
        'channels.whatsapp.monthlyLimit': 3001,
      },
    });

    expect(result.data.values['messages.bolsa.utilidad']).toBe(751);
    expect(result.data.values['messages.bolsa.marketingComercial']).toBe(750);
    expect(result.data.values['messages.bolsa.servicio']).toBe(750);
  });

  it('upsertConfig rechaza cuando la suma de bolsas no cuadra con la global', async () => {
    const doc: any = {
      tenantId: '0000000',
      company: 'BPONET',
      version: 1,
      values: {
        'channels.whatsapp.enabled': true,
        'channels.whatsapp.monthlyLimit': 10,
        'messages.bolsa.utilidad': 10,
        'messages.bolsa.marketingComercial': 0,
        'messages.bolsa.autenticacion': 0,
        'messages.bolsa.servicio': 0,
      },
      save: jest.fn().mockResolvedValue(true),
      toObject() {
        return { ...this, save: undefined };
      },
    };
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(doc) });

    await expect(
      service.upsertConfig({
        tenantId: '0000000',
        values: { 'messages.bolsa.servicio': 5 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('upsertConfig permite bolsas libres cuando la global es 0', async () => {
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(null) });
    tenantConfigModel.create.mockImplementation((data: any) => ({
      toObject: () => data,
    }));

    const result = await service.upsertConfig({
      tenantId: '0000000',
      values: {
        'channels.whatsapp.enabled': true,
        'channels.whatsapp.monthlyLimit': 0,
        'messages.bolsa.servicio': 500,
      },
    });

    expect(result.data.values['messages.bolsa.servicio']).toBe(500);
  });

  it('patchValues mezcla e incrementa versión sobre config existente', async () => {
    const doc: any = {
      tenantId: '0000000',
      company: 'BPONET',
      version: 1,
      values: { 'features.pbx': false },
      save: jest.fn().mockResolvedValue(true),
      toObject() {
        return { ...this, save: undefined };
      },
    };
    tenantConfigModel.findOne.mockReturnValue({ exec: () => Promise.resolve(doc) });

    const result = await service.patchValues('0000000', {
      values: { 'features.pbx': true },
    });

    expect(doc.version).toBe(2);
    expect(result.data.features.pbx).toBe(true);
  });

  it('reportUsage acumula con $inc y evita duplicados por reportId', async () => {
    tenantUsageModel.findOneAndUpdate.mockReturnValue(lean({ tenantId: '0000000' }));

    await service.reportUsage('0000000', '2026-09', { 'sms.sent': 10 }, 'rep-1');
    expect(tenantUsageReportModel.create).toHaveBeenCalledWith({
      reportId: 'rep-1',
      tenantId: '0000000',
      period: '2026-09',
    });
    expect(tenantUsageModel.findOneAndUpdate).toHaveBeenCalled();

    tenantUsageReportModel.create.mockRejectedValueOnce({ code: 11000 });
    const dup = await service.reportUsage(
      '0000000',
      '2026-09',
      { 'sms.sent': 10 },
      'rep-1',
    );
    expect(dup.data.duplicated).toBe(true);
  });

  it('getCatalog ordena/lista definiciones', async () => {
    const result = await service.getCatalog(true);
    expect(result.data).toHaveLength(definitions.length);
    expect(result.meta.totalData).toBe(definitions.length);
  });

  it('createDefinition rechaza duplicados', async () => {
    policyDefinitionModel.findOne.mockReturnValue(lean({ key: 'features.pbx' }));
    await expect(
      service.createDefinition({ key: 'features.pbx' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  describe('removeDefinition', () => {
    it('elimina una política nueva (no de sistema)', async () => {
      policyDefinitionModel.findOne.mockReturnValue(
        lean({ key: 'custom.x', isSystem: false }),
      );
      policyDefinitionModel.findOneAndDelete.mockReturnValue(
        lean({ key: 'custom.x' }),
      );

      const result = await service.removeDefinition('custom.x');

      expect(result.data).toEqual({ key: 'custom.x' });
      expect(policyDefinitionModel.findOneAndDelete).toHaveBeenCalledWith({
        key: 'custom.x',
      });
    });

    it('rechaza eliminar una política del sistema', async () => {
      policyDefinitionModel.findOne.mockReturnValue(
        lean({ key: 'limits.maxUsers', isSystem: true }),
      );

      await expect(service.removeDefinition('limits.maxUsers')).rejects.toThrow(
        ForbiddenException,
      );
      expect(policyDefinitionModel.findOneAndDelete).not.toHaveBeenCalled();
    });

    it('lanza NotFound si la política no existe', async () => {
      policyDefinitionModel.findOne.mockReturnValue(lean(null));

      await expect(service.removeDefinition('nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getPolicyValue', () => {
    it('busca por tenantId o company con $or', async () => {
      policyDefinitionModel.findOne.mockReturnValue(
        lean({ key: 'general.timezone', defaultValue: 'America/Bogota' }),
      );
      const findOne = jest.fn().mockReturnValue(
        lean({ values: { 'general.timezone': 'Europe/Madrid' } }),
      );
      tenantConfigModel.findOne = findOne;

      const value = await service.getPolicyValue(
        'tenant-x',
        'tenant-x',
        'general.timezone',
      );

      expect(findOne).toHaveBeenCalledWith({
        $or: [{ tenantId: 'tenant-x' }, { company: 'tenant-x' }],
      });
      expect(value).toBe('Europe/Madrid');
    });

    it('cae al default del catálogo si no hay config', async () => {
      policyDefinitionModel.findOne.mockReturnValue(
        lean({ key: 'general.locale', defaultValue: 'es-CO' }),
      );
      tenantConfigModel.findOne = jest.fn().mockReturnValue(lean(null));

      const value = await service.getPolicyValue('t', 'c', 'general.locale');
      expect(value).toBe('es-CO');
    });
  });

  describe('catálogo', () => {
    it('seedDefaultCatalog crea general.timezone como select con opciones', async () => {
      policyDefinitionModel.findOne.mockReturnValue(lean(null));
      policyDefinitionModel.updateOne = jest
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 0 }) });

      await service.seedDefaultCatalog();

      const call = policyDefinitionModel.create.mock.calls.find(
        (c: any[]) => c[0].key === 'general.timezone',
      );
      expect(call).toBeDefined();
      expect(call[0].type).toBe('select');
      expect(call[0].options.length).toBeGreaterThan(0);
    });

    it('syncSystemCatalog actualiza definiciones de sistema', async () => {
      policyDefinitionModel.updateOne = jest
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 1 }) });

      const updated = await service.syncSystemCatalog();

      expect(updated).toBeGreaterThan(0);
      expect(policyDefinitionModel.updateOne).toHaveBeenCalled();
    });

    it('purgeDeprecatedCatalog elimina límites obsoletos y limpia valores', async () => {
      policyDefinitionModel.deleteOne = jest
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve({ deletedCount: 1 }) });
      const updateMany = jest
        .fn()
        .mockReturnValue({ exec: () => Promise.resolve({ modifiedCount: 1 }) });
      tenantConfigModel.updateMany = updateMany;

      const removed = await service.purgeDeprecatedCatalog();

      expect(removed).toBe(3);
      expect(updateMany).toHaveBeenCalled();
    });
  });
});
