import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

/**
 * Resuelve "entitlements"/features y switches de canal definidos como
 * políticas del tenant (`features.*`, `channels.*`).
 *
 * Criterio: una política desactivada es `false`; cualquier otro valor
 * (incluido `undefined`) se considera habilitado. Fail-closed: si no se
 * puede resolver la política, se trata como deshabilitada.
 */
@Injectable()
export class FeaturePolicyService {
  private readonly logger = new Logger(FeaturePolicyService.name);

  constructor(private readonly tenantConfigService: TenantConfigService) {}

  async isEnabled(
    tenantId: string | undefined,
    company: string | undefined,
    key: string,
  ): Promise<boolean> {
    try {
      const value = await this.tenantConfigService.getPolicyValue(
        tenantId,
        company,
        key,
      );
      return value !== false;
    } catch (error: any) {
      this.logger.warn(
        `No se pudo resolver la política "${key}": ${error?.message}`,
      );
      return false;
    }
  }

  async assertEnabled(
    tenantId: string | undefined,
    company: string | undefined,
    key: string,
    message?: string,
  ): Promise<void> {
    const enabled = await this.isEnabled(tenantId, company, key);
    if (!enabled) {
      throw new ForbiddenException(
        message || `La función "${key}" no está habilitada para la empresa`,
      );
    }
  }
}
