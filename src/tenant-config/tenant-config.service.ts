import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';

import {
  PolicyDefinition,
} from './entities/policy-definition.entity';
import { TenantConfig } from './entities/tenant-config.entity';
import {
  TenantUsage,
  TenantUsageReport,
} from './entities/tenant-usage.entity';
import { POLICY_CATALOG_SEED } from './policy-catalog.seed';
import {
  CreatePolicyDefinitionDto,
  UpdatePolicyDefinitionDto,
} from './dto/policy-definition.dto';
import { PatchTenantConfigValuesDto } from './dto/tenant-config.dto';

@Injectable()
export class TenantConfigService {
  private readonly logger = new Logger(TenantConfigService.name);

  constructor(
    @InjectModel('PolicyDefinition')
    private readonly policyDefinitionModel: Model<PolicyDefinition>,
    @InjectModel('TenantConfig')
    private readonly tenantConfigModel: Model<TenantConfig>,
    @InjectModel('TenantUsage')
    private readonly tenantUsageModel: Model<TenantUsage>,
    @InjectModel('TenantUsageReport')
    private readonly tenantUsageReportModel: Model<TenantUsageReport>,
    private readonly configService: ConfigService,
  ) {}

  isEmbedEnabled(): boolean {
    const value = this.configService.get<string>(
      'TENANT_CONFIG_EMBED_IN_AUTH',
      'true',
    );
    return String(value).toLowerCase() !== 'false';
  }

  // ---------------------------------------------------------------- Catalog

  async getCatalog(onlyActive = true) {
    const query = onlyActive ? { isActive: true } : {};
    const definitions = await this.policyDefinitionModel
      .find(query)
      .sort({ group: 1, order: 1, key: 1 })
      .lean()
      .exec();

    return {
      message: 'Policy catalog retrieved successfully',
      data: definitions,
      meta: { totalData: definitions.length },
    };
  }

  /** Siembra las definiciones base que aún no existan (idempotente). */
  async seedDefaultCatalog(): Promise<number> {
    let created = 0;
    for (const seed of POLICY_CATALOG_SEED) {
      const exists = await this.policyDefinitionModel
        .findOne({ key: seed.key })
        .lean()
        .exec();
      if (exists) continue;
      await this.policyDefinitionModel.create({
        ...seed,
        options: [],
        min: null,
        max: null,
        isActive: true,
      });
      created += 1;
    }
    if (created > 0) {
      this.logger.log(`Catálogo de políticas sembrado: ${created} nuevas.`);
    }
    return created;
  }

  async createDefinition(dto: CreatePolicyDefinitionDto) {
    const exists = await this.policyDefinitionModel
      .findOne({ key: dto.key })
      .lean()
      .exec();
    if (exists) {
      throw new BadRequestException(`La política "${dto.key}" ya existe`);
    }
    const created = await this.policyDefinitionModel.create({
      ...dto,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
      isSystem: false,
    });
    return {
      message: 'Policy definition created successfully',
      data: created.toObject(),
      meta: { totalData: 1, id: created._id },
    };
  }

  async updateDefinition(key: string, dto: UpdatePolicyDefinitionDto) {
    const updated = await this.policyDefinitionModel
      .findOneAndUpdate({ key }, { $set: dto }, { new: true })
      .lean()
      .exec();
    if (!updated) {
      throw new NotFoundException(`Policy definition "${key}" not found`);
    }
    return {
      message: 'Policy definition updated successfully',
      data: updated,
      meta: { totalData: 1 },
    };
  }

  async removeDefinition(key: string) {
    const deleted = await this.policyDefinitionModel
      .findOneAndDelete({ key })
      .lean()
      .exec();
    if (!deleted) {
      throw new NotFoundException(`Policy definition "${key}" not found`);
    }
    return {
      message: 'Policy definition removed successfully',
      data: deleted,
      meta: { totalData: 1 },
    };
  }

  // ----------------------------------------------------------- Tenant config

  async resolveConfig(tenantId?: string, company?: string) {
    const definitions = await this.policyDefinitionModel
      .find({ isActive: true })
      .lean()
      .exec();

    const query = tenantId ? { tenantId } : company ? { company } : null;
    const config = query
      ? await this.tenantConfigModel.findOne(query).lean().exec()
      : null;

    const values: Record<string, any> = {};
    for (const def of definitions) {
      values[def.key] = def.defaultValue;
    }
    Object.assign(values, config?.values || {});

    return {
      message: 'Tenant config resolved successfully',
      data: {
        tenantId: config?.tenantId ?? tenantId ?? null,
        company: config?.company ?? company ?? null,
        isActive: config?.isActive ?? true,
        version: config?.version ?? 0,
        updatedAt: config?.updatedAt ?? null,
        ...this.buildNested(values),
      },
      meta: { totalData: 1 },
    };
  }

  /** Crea la configuración del tenant si no existe (idempotente). */
  async ensureConfig(tenantId: string, company: string): Promise<boolean> {
    if (!tenantId) return false;
    const exists = await this.tenantConfigModel
      .findOne({ tenantId })
      .lean()
      .exec();
    if (exists) return false;
    const defs = await this.getDefinitionsMap();
    await this.tenantConfigModel.create({
      tenantId,
      company,
      isActive: true,
      version: 1,
      values: this.defaultsFromCatalog(defs),
    });
    this.logger.log(`Tenant config creada para ${company} (${tenantId}).`);
    return true;
  }

  /**
   * Valor resuelto de una política puntual (default ∪ valor del tenant).
   * Útil para enforcement (p. ej. límite de usuarios). 0 = ilimitado.
   */
  async getPolicyValue(
    tenantId: string | undefined,
    company: string | undefined,
    key: string,
  ): Promise<any> {
    const def = await this.policyDefinitionModel
      .findOne({ key })
      .lean()
      .exec();
    const query = tenantId ? { tenantId } : company ? { company } : null;
    const config = query
      ? await this.tenantConfigModel.findOne(query).lean().exec()
      : null;
    const value = config?.values?.[key];
    return value !== undefined ? value : def?.defaultValue;
  }

  async listConfigs() {
    const configs = await this.tenantConfigModel
      .find()
      .sort({ company: 1 })
      .lean()
      .exec();
    return {
      message: 'Tenant configs retrieved successfully',
      data: configs,
      meta: { totalData: configs.length },
    };
  }

  async getConfigByTenant(tenantId: string) {
    const config = await this.tenantConfigModel
      .findOne({ tenantId })
      .lean()
      .exec();
    if (!config) {
      return this.resolveConfig(tenantId);
    }
    return {
      message: 'Tenant config retrieved successfully',
      data: {
        ...config,
        ...this.buildNested({
          ...this.defaultsFromCatalog(await this.getDefinitionsMap()),
          ...(config.values || {}),
        }),
      },
      meta: { totalData: 1 },
    };
  }

  async upsertConfig(dto: {
    tenantId: string;
    company?: string;
    isActive?: boolean;
    values?: Record<string, any>;
  }) {
    const sanitized = await this.sanitizeValues(dto.values || {});

    const existing = await this.tenantConfigModel
      .findOne({ tenantId: dto.tenantId })
      .exec();

    if (existing) {
      existing.values = { ...(existing.values || {}), ...sanitized };
      if (dto.company) existing.company = dto.company;
      if (dto.isActive !== undefined) existing.isActive = dto.isActive;
      existing.version = (existing.version || 0) + 1;
      await existing.save();
      return this.wrapConfig(existing.toObject());
    }

    const created = await this.tenantConfigModel.create({
      tenantId: dto.tenantId,
      company: dto.company ?? '',
      isActive: dto.isActive ?? true,
      version: 1,
      values: sanitized,
    });
    return this.wrapConfig(created.toObject());
  }

  async patchValues(tenantId: string, dto: PatchTenantConfigValuesDto) {
    const sanitized = await this.sanitizeValues(dto.values || {});

    const existing = await this.tenantConfigModel
      .findOne({ tenantId })
      .exec();

    if (existing) {
      existing.values = { ...(existing.values || {}), ...sanitized };
      existing.version = (existing.version || 0) + 1;
      await existing.save();
      return this.wrapConfig(existing.toObject());
    }

    // Si no existe, se crea con los valores por defecto + los indicados.
    const defs = await this.getDefinitionsMap();
    const allValues = {
      ...this.defaultsFromCatalog(defs),
      ...sanitized,
    };
    const created = await this.tenantConfigModel.create({
      tenantId,
      company: '',
      isActive: true,
      version: 1,
      values: allValues,
    });
    return this.wrapConfig(created.toObject());
  }

  /**
   * Fija solo las claves indicadas (merge) e incrementa la versión.
   */
  async setValues(tenantId: string, values: Record<string, any>) {
    return this.patchValues(tenantId, { values });
  }

  // ------------------------------------------------------------------- Usage

  async reportUsage(
    tenantId: string,
    period: string,
    metrics: Record<string, number>,
    reportId?: string,
  ) {
    if (reportId) {
      try {
        await this.tenantUsageReportModel.create({
          reportId,
          tenantId,
          period,
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          this.logger.warn(`Reporte duplicado ignorado: ${reportId}`);
          return {
            message: 'Usage report already processed',
            data: { tenantId, period, duplicated: true },
            meta: { totalData: 1 },
          };
        }
        throw error;
      }
    }

    const inc: Record<string, number> = {};
    for (const [key, value] of Object.entries(metrics || {})) {
      const delta = Number(value);
      if (!Number.isFinite(delta) || delta === 0) continue;
      inc[`metrics.${key}`] = delta;
    }

    const updated = await this.tenantUsageModel
      .findOneAndUpdate(
        { tenantId, period },
        {
          ...(Object.keys(inc).length > 0 ? { $inc: inc } : {}),
          $setOnInsert: { tenantId, period },
        },
        { new: true, upsert: true },
      )
      .lean()
      .exec();

    return {
      message: 'Usage reported successfully',
      data: updated,
      meta: { totalData: 1 },
    };
  }

  async getUsage(tenantId: string, period?: string) {
    const query: any = { tenantId };
    if (period) query.period = period;
    const usage = await this.tenantUsageModel
      .find(query)
      .sort({ period: -1 })
      .lean()
      .exec();

    return {
      message: 'Tenant usage retrieved successfully',
      data: usage,
      meta: { totalData: usage.length },
    };
  }

  async listUsage(period?: string) {
    const query: any = {};
    if (period) query.period = period;
    const usage = await this.tenantUsageModel
      .find(query)
      .sort({ period: -1, tenantId: 1 })
      .lean()
      .exec();

    return {
      message: 'Tenant usage list retrieved successfully',
      data: usage,
      meta: { totalData: usage.length },
    };
  }

  // --------------------------------------------------------------- Helpers

  private wrapConfig(config: any) {
    return {
      message: 'Tenant config saved successfully',
      data: {
        ...config,
        ...this.buildNested(config.values || {}),
      },
      meta: { totalData: 1 },
    };
  }

  private async getDefinitionsMap(): Promise<
    Record<string, PolicyDefinition>
  > {
    const defs = await this.policyDefinitionModel.find().lean().exec();
    return Object.fromEntries(defs.map((d) => [d.key, d]));
  }

  private defaultsFromCatalog(
    defs: Record<string, PolicyDefinition>,
  ): Record<string, any> {
    return Object.fromEntries(
      Object.values(defs).map((d) => [d.key, d.defaultValue]),
    );
  }

  private async sanitizeValues(
    input: Record<string, any>,
  ): Promise<Record<string, any>> {
    const defs = await this.getDefinitionsMap();
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(input || {})) {
      const def = defs[key];
      if (!def) {
        this.logger.warn(`Política desconocida "${key}" ignorada.`);
        continue;
      }
      result[key] = this.validateValue(def, value);
    }
    return result;
  }

  private validateValue(def: PolicyDefinition, value: any): any {
    switch (def.type) {
      case 'boolean': {
        if (typeof value !== 'boolean') {
          throw new BadRequestException(`"${def.key}" debe ser booleano`);
        }
        return value;
      }
      case 'number': {
        const num = Number(value);
        if (Number.isNaN(num)) {
          throw new BadRequestException(`"${def.key}" debe ser numérico`);
        }
        if (def.min !== null && def.min !== undefined && num < def.min) {
          throw new BadRequestException(
            `"${def.key}" no puede ser menor que ${def.min}`,
          );
        }
        if (def.max !== null && def.max !== undefined && num > def.max) {
          throw new BadRequestException(
            `"${def.key}" no puede ser mayor que ${def.max}`,
          );
        }
        return num;
      }
      case 'select': {
        const allowed = (def.options || []).map((o) => o.value);
        if (allowed.length > 0 && !allowed.includes(value)) {
          throw new BadRequestException(
            `"${def.key}" debe ser uno de: ${allowed.join(', ')}`,
          );
        }
        return value;
      }
      case 'text':
        return String(value);
      case 'json':
        return value;
      default:
        return value;
    }
  }

  private buildNested(flat: Record<string, any>): Record<string, any> {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(flat)) {
      const parts = key.split('.');
      let cursor = out;
      for (let i = 0; i < parts.length - 1; i += 1) {
        if (typeof cursor[parts[i]] !== 'object' || cursor[parts[i]] === null) {
          cursor[parts[i]] = {};
        }
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = value;
    }
    return out;
  }
}
