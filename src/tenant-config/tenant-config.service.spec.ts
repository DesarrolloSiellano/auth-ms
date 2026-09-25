import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
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
    };
    tenantConfigModel = {
      find: jest.fn().mockReturnValue(sortLean([])),
      findOne: jest.fn(),
      create: jest.fn(),
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
    expect(result.data).toHaveLength(2);
    expect(result.meta.totalData).toBe(2);
  });

  it('createDefinition rechaza duplicados', async () => {
    policyDefinitionModel.findOne.mockReturnValue(lean({ key: 'features.pbx' }));
    await expect(
      service.createDefinition({ key: 'features.pbx' } as any),
    ).rejects.toThrow(BadRequestException);
  });
});
