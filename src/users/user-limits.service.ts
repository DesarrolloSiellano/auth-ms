import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import { User } from './entities/user.entity';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { tenantLocalStorage } from 'src/core/database/tenant.context';

export interface UserLimitCheck {
  /** Empresa/tenant a validar. Si no se indica, se toma del contexto. */
  company?: string;
  tenantId?: string;
  /** Usuarios adicionales que se crearán (default 1). */
  additionalUsers?: number;
  /** Titulares adicionales por código de rol (altas netas). */
  roleDemands?: Record<string, number>;
}

/**
 * Valida los topes de usuarios por tenant definidos en las políticas
 * (`limits.maxUsers` y `limits.roles.<CODE>`). 0 = ilimitado.
 *
 * auth-ms es la autoridad: la creación individual, la carga masiva y la
 * creación desde apps externas pasan por aquí (fail-closed).
 */
@Injectable()
export class UserLimitsService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly tenantConfigService: TenantConfigService,
  ) {}

  private normalizeCode(code: string): string {
    return String(code || '')
      .trim()
      .toUpperCase();
  }

  roleLimitKey(code: string): string {
    return `limits.roles.${this.normalizeCode(code)}`;
  }

  /** 0 = ilimitado. */
  private normalizeLimit(raw: unknown): number {
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private resolveContext(company?: string, tenantId?: string) {
    const store = tenantLocalStorage.getStore();
    const finalCompany = company || store?.companyId;
    const finalTenant = tenantId || store?.tenantId || finalCompany;
    return { company: finalCompany, tenantId: finalTenant };
  }

  /** Tope total de usuarios del tenant. 0 = ilimitado. */
  async resolveUserLimit(
    tenantId?: string,
    company?: string,
  ): Promise<number> {
    const raw = await this.tenantConfigService.getPolicyValue(
      tenantId,
      company,
      'limits.maxUsers',
    );
    return this.normalizeLimit(raw);
  }

  /**
   * Tope de usuarios para un rol (`limits.roles.<CODE>`). 0 = ilimitado.
   */
  async resolveRoleLimit(
    tenantId: string | undefined,
    company: string | undefined,
    code: string,
  ): Promise<number> {
    const key = this.roleLimitKey(code);
    const configured = await this.tenantConfigService.getConfiguredValue(
      tenantId,
      company,
      key,
    );
    if (configured.isSet) return this.normalizeLimit(configured.value);

    const fallback = await this.tenantConfigService.getPolicyValue(
      tenantId,
      company,
      key,
    );
    return this.normalizeLimit(fallback);
  }

  /** Usuarios activos y no borrados de la empresa (opcionalmente por rol). */
  async countActiveUsers(
    company: string,
    roleCode?: string,
    excludeUserId?: string,
  ): Promise<number> {
    const query: any = { company, deletedAt: null, isActived: true };
    if (roleCode) query['roles.codeRol'] = this.normalizeCode(roleCode);
    if (excludeUserId) query._id = { $ne: excludeUserId };
    const count = await this.userModel
      .countDocuments(query)
      .setOptions({ bypassTenant: true })
      .exec();
    return Number(count) || 0;
  }

  /**
   * Valida que la operación no supere los topes del tenant. Lanza 409 si
   * se excede `limits.maxUsers` o `limits.roles.<CODE>`.
   */
  async assertWithinLimits(check: UserLimitCheck = {}): Promise<void> {
    const { company, tenantId } = this.resolveContext(
      check.company,
      check.tenantId,
    );
    if (!company) return;

    const additionalUsers = Math.max(0, check.additionalUsers ?? 1);

    if (additionalUsers > 0) {
      const limit = await this.resolveUserLimit(tenantId, company);
      if (limit > 0) {
        const current = await this.countActiveUsers(company);
        if (current + additionalUsers > limit) {
          throw new ConflictException(
            `Se alcanzó el máximo de usuarios permitido para la empresa (${limit})`,
          );
        }
      }
    }

    for (const [code, demandRaw] of Object.entries(check.roleDemands || {})) {
      const demand = Math.max(0, Number(demandRaw) || 0);
      if (demand <= 0) continue;
      const limit = await this.resolveRoleLimit(tenantId, company, code);
      if (limit <= 0) continue;
      const current = await this.countActiveUsers(company, code);
      if (current + demand > limit) {
        throw new ConflictException(
          `Se alcanzó el máximo de usuarios con el rol ${this.normalizeCode(code)} para la empresa (${limit})`,
        );
      }
    }
  }

  /** Cuenta titulares por cada código de una lista, útil para altas de rol. */
  buildRoleDemands(codes: string[]): Record<string, number> {
    const demands: Record<string, number> = {};
    for (const code of codes) {
      const normalized = this.normalizeCode(code);
      if (!normalized) continue;
      demands[normalized] = (demands[normalized] || 0) + 1;
    }
    return demands;
  }

  /** Registra (idempotente) la política `limits.roles.<CODE>`. */
  async ensureRoleLimitPolicy(code: string, label?: string): Promise<boolean> {
    return this.tenantConfigService.ensureRoleLimitPolicy(code, label);
  }

  /** Códigos de rol presentes en un arreglo de roles (objetos o strings). */
  extractRoleCodes(roles: unknown): string[] {
    if (!Array.isArray(roles)) return [];
    return roles
      .map((role: any) => {
        if (!role) return '';
        if (typeof role === 'string') return role;
        return role.codeRol || role.roleCode || role.code || '';
      })
      .filter((code: string) => !!code);
  }
}
