import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException } from '@nestjs/common';

import { UserLimitsService } from './user-limits.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

describe('UserLimitsService', () => {
  let service: UserLimitsService;
  let userModel: any;
  let tenantConfigService: any;

  function countResult(value: number) {
    return {
      setOptions: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(value),
      }),
    };
  }

  beforeEach(async () => {
    userModel = { countDocuments: jest.fn().mockReturnValue(countResult(0)) };
    tenantConfigService = {
      getPolicyValue: jest.fn().mockResolvedValue(0),
      getConfiguredValue: jest
        .fn()
        .mockResolvedValue({ isSet: false, value: undefined }),
      ensureRoleLimitPolicy: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserLimitsService,
        { provide: getModelToken('User'), useValue: userModel },
        { provide: TenantConfigService, useValue: tenantConfigService },
      ],
    }).compile();

    service = module.get(UserLimitsService);
  });

  it('normaliza límites <= 0 como ilimitado', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(-3);
    await expect(service.resolveUserLimit('t1', 'ACME')).resolves.toBe(0);
  });

  it('no valida cuando no hay empresa (sin contexto)', async () => {
    await expect(
      service.assertWithinLimits({ company: undefined, additionalUsers: 1 }),
    ).resolves.toBeUndefined();
  });

  it('bloquea cuando se supera limits.maxUsers', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(5);
    userModel.countDocuments.mockReturnValue(countResult(5));

    await expect(
      service.assertWithinLimits({ company: 'ACME', tenantId: 't1' }),
    ).rejects.toThrow(ConflictException);
  });

  it('permite crear si el límite es 0 (ilimitado)', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(0);

    await expect(
      service.assertWithinLimits({ company: 'ACME', tenantId: 't1' }),
    ).resolves.toBeUndefined();
    expect(userModel.countDocuments).not.toHaveBeenCalled();
  });

  it('bloquea cuando se supera el tope de un rol', async () => {
    // maxUsers ilimitado; AGE configurado explícitamente a 2 con 2 existentes.
    tenantConfigService.getPolicyValue.mockResolvedValue(0);
    tenantConfigService.getConfiguredValue.mockResolvedValue({
      isSet: true,
      value: 2,
    });
    userModel.countDocuments.mockReturnValue(countResult(2));

    await expect(
      service.assertWithinLimits({
        company: 'ACME',
        tenantId: 't1',
        additionalUsers: 0,
        roleDemands: { AGE: 1 },
      }),
    ).rejects.toThrow(/rol AGE/);
  });

  it('para AGE usa el default de limits.roles.AGE cuando no está configurado', async () => {
    tenantConfigService.getConfiguredValue.mockResolvedValue({
      isSet: false,
      value: undefined,
    });
    tenantConfigService.getPolicyValue.mockImplementation(
      (_t: any, _c: any, key: string) =>
        Promise.resolve(key === 'limits.roles.AGE' ? 7 : 0),
    );

    await expect(service.resolveRoleLimit('t1', 'ACME', 'AGE')).resolves.toBe(7);
  });

  it('el valor explícito de limits.roles.AGE tiene prioridad sobre el default', async () => {
    tenantConfigService.getConfiguredValue.mockResolvedValue({
      isSet: true,
      value: 100,
    });
    tenantConfigService.getPolicyValue.mockResolvedValue(7);

    await expect(service.resolveRoleLimit('t1', 'ACME', 'AGE')).resolves.toBe(
      100,
    );
  });

  it('buildRoleDemands y extractRoleCodes funcionan juntos', () => {
    const codes = service.extractRoleCodes([
      { codeRol: 'age' },
      'USR',
      { roleCode: 'AGE' },
    ]);
    expect(codes).toEqual(['age', 'USR', 'AGE']);
    expect(service.buildRoleDemands(codes)).toEqual({ AGE: 2, USR: 1 });
  });
});
