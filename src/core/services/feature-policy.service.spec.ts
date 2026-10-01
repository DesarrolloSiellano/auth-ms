import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { FeaturePolicyService } from './feature-policy.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

describe('FeaturePolicyService', () => {
  let service: FeaturePolicyService;
  let tenantConfigService: any;

  beforeEach(async () => {
    tenantConfigService = { getPolicyValue: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeaturePolicyService,
        { provide: TenantConfigService, useValue: tenantConfigService },
      ],
    }).compile();
    service = module.get(FeaturePolicyService);
  });

  it('considera habilitada cuando el valor es true o undefined', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(undefined);
    await expect(service.isEnabled('t', 'c', 'features.x')).resolves.toBe(true);

    tenantConfigService.getPolicyValue.mockResolvedValue(true);
    await expect(service.isEnabled('t', 'c', 'features.x')).resolves.toBe(true);
  });

  it('considera deshabilitada cuando el valor es false', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(false);
    await expect(service.isEnabled('t', 'c', 'features.x')).resolves.toBe(
      false,
    );
  });

  it('fail-closed: deshabilitada si la consulta falla', async () => {
    tenantConfigService.getPolicyValue.mockRejectedValue(new Error('db down'));
    await expect(service.isEnabled('t', 'c', 'features.x')).resolves.toBe(
      false,
    );
  });

  it('assertEnabled lanza ForbiddenException cuando está deshabilitada', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(false);
    await expect(
      service.assertEnabled('t', 'c', 'features.x', 'No disponible'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('assertEnabled no lanza cuando está habilitada', async () => {
    tenantConfigService.getPolicyValue.mockResolvedValue(true);
    await expect(
      service.assertEnabled('t', 'c', 'features.x'),
    ).resolves.toBeUndefined();
  });
});
