import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
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

/**
 * Políticas obsoletas que deben eliminarse del catálogo y de los valores de
 * los tenants al arrancar (p. ej. `limits.maxAgents`, reemplazada por
 * `limits.roles.AGE`).
 */
const DEPRECATED_POLICY_KEYS = [
  'limits.maxAgents',
  'messages.texto.limit',
  'messages.audio.limit',
];

/** Bolsa global de WhatsApp (tope total del canal, `0` = ilimitado). */
const WHATSAPP_GLOBAL_BAG_KEY = 'channels.whatsapp.monthlyLimit';

/** Bolsas por categoría de WhatsApp (deben sumar la bolsa global cuando > 0). */
const WHATSAPP_CATEGORY_BAG_KEYS = [
  'messages.bolsa.utilidad',
  'messages.bolsa.marketingComercial',
  'messages.bolsa.autenticacion',
  'messages.bolsa.servicio',
];

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
        options: seed.options ?? [],
        min: null,
        max: null,
        isActive: true,
      });
      created += 1;
    }
    const updated = await this.syncSystemCatalog();
    const removed = await this.purgeDeprecatedCatalog();
    if (created > 0 || updated > 0 || removed > 0) {
      this.logger.log(
        `Catálogo de políticas: ${created} nuevas, ${updated} actualizadas, ${removed} obsoletas eliminadas.`,
      );
    }
    return created;
  }

  /**
   * Sincroniza metadatos de las definiciones de sistema existentes
   * (`type`, `options`, `defaultValue`, `label`, `order`, …). No modifica
   * `isActive` ni crea definiciones (eso lo hace `seedDefaultCatalog`).
   * Necesario porque el seed es create-only y las políticas pueden cambiar
   * de forma (p. ej. `general.timezone` de texto a select).
   */
  async syncSystemCatalog(): Promise<number> {
    let updated = 0;
    for (const seed of POLICY_CATALOG_SEED) {
      if (!seed.isSystem) continue;
      const result = await this.policyDefinitionModel
        .updateOne(
          { key: seed.key, isSystem: true },
          {
            $set: {
              label: seed.label,
              description: seed.description ?? '',
              group: seed.group,
              type: seed.type,
              defaultValue: seed.defaultValue,
              options: seed.options ?? [],
              unit: seed.unit ?? '',
              order: seed.order,
            },
          },
        )
        .exec();
      if (result.modifiedCount > 0) updated += 1;
    }
    return updated;
  }

  /**
   * Elimina del catálogo las políticas obsoletas y limpia sus valores de la
   * configuración de todos los tenants. Idempotente.
   */
  async purgeDeprecatedCatalog(): Promise<number> {
    let removed = 0;
    for (const key of DEPRECATED_POLICY_KEYS) {
      const result = await this.policyDefinitionModel
        .deleteOne({ key })
        .exec();
      if (result.deletedCount > 0) removed += 1;
      await this.tenantConfigModel
        .updateMany(
          { [`values.${key}`]: { $exists: true } },
          { $unset: { [`values.${key}`]: '' } },
        )
        .exec();
    }
    return removed;
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
    const existing = await this.policyDefinitionModel
      .findOne({ key })
      .lean()
      .exec();
    if (!existing) {
      throw new NotFoundException(`Policy definition "${key}" not found`);
    }
    // Las políticas del sistema no se pueden eliminar (solo las nuevas).
    if (existing.isSystem) {
      throw new ForbiddenException(
        `La política de sistema "${key}" no se puede eliminar`,
      );
    }

    const deleted = await this.policyDefinitionModel
      .findOneAndDelete({ key })
      .lean()
      .exec();
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
    // Busca por tenantId y, si no hay config, cae a company. Se buscan ambas
    // claves juntas para tolerar usuarios cuyo `tenantId` no coincide con el
    // `_id` de la empresa (p. ej. nombre o valor legado) y evitar caer al
    // default del catálogo.
    const or: any[] = [];
    if (tenantId) or.push({ tenantId });
    if (company) or.push({ company });
    const config =
      or.length > 0
        ? await this.tenantConfigModel.findOne({ $or: or }).lean().exec()
        : null;
    const value = config?.values?.[key];
    return value !== undefined ? value : def?.defaultValue;
  }

  /**
   * Indica si un valor fue fijado explícitamente para el tenant (no es
   * default del catálogo). Útil para respetar valores legados al introducir
   * nuevas claves (p. ej. `limits.roles.<CODE>`).
   */
  async getConfiguredValue(
    tenantId: string | undefined,
    company: string | undefined,
    key: string,
  ): Promise<{ isSet: boolean; value: any }> {
    const query = tenantId ? { tenantId } : company ? { company } : null;
    const config = query
      ? await this.tenantConfigModel.findOne(query).lean().exec()
      : null;
    const value = config?.values?.[key];
    return { isSet: value !== undefined, value };
  }

  /**
   * Registra (idempotente) la definición de política `limits.roles.<CODE>`
   * para un rol. Necesario porque `sanitizeValues` ignora claves sin
   * definición y los roles se crean dinámicamente. 0 = ilimitado.
   */
  async ensureRoleLimitPolicy(code: string, label?: string): Promise<boolean> {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return false;
    const key = `limits.roles.${normalized}`;
    const exists = await this.policyDefinitionModel
      .findOne({ key })
      .lean()
      .exec();
    if (exists) return false;
    await this.policyDefinitionModel.create({
      key,
      label: label ? `Máx. ${label}` : `Máx. usuarios con rol ${normalized}`,
      description: '0 = ilimitado',
      group: 'limits',
      type: 'number',
      defaultValue: 0,
      unit: '',
      order: 60,
      isActive: true,
      isSystem: false,
    });
    this.logger.log(`Política de límite de rol creada: ${key}.`);
    return true;
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
    const incomingKeys = Object.keys(sanitized);

    const existing = await this.tenantConfigModel
      .findOne({ tenantId: dto.tenantId })
      .exec();

    if (existing) {
      const merged = { ...(existing.values || {}), ...sanitized };
      this.applyWhatsappBagRules(merged, incomingKeys, existing.values || {});
      existing.values = merged;
      if (dto.company) existing.company = dto.company;
      if (dto.isActive !== undefined) existing.isActive = dto.isActive;
      existing.version = (existing.version || 0) + 1;
      await existing.save();
      return this.wrapConfig(existing.toObject());
    }

    const merged = { ...sanitized };
    this.applyWhatsappBagRules(merged, incomingKeys);
    const created = await this.tenantConfigModel.create({
      tenantId: dto.tenantId,
      company: dto.company ?? '',
      isActive: dto.isActive ?? true,
      version: 1,
      values: merged,
    });
    return this.wrapConfig(created.toObject());
  }

  async patchValues(tenantId: string, dto: PatchTenantConfigValuesDto) {
    const sanitized = await this.sanitizeValues(dto.values || {});
    const incomingKeys = Object.keys(sanitized);

    const existing = await this.tenantConfigModel
      .findOne({ tenantId })
      .exec();

    if (existing) {
      const merged = { ...(existing.values || {}), ...sanitized };
      this.applyWhatsappBagRules(merged, incomingKeys, existing.values || {});
      existing.values = merged;
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
    this.applyWhatsappBagRules(allValues, incomingKeys);
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
   * Coherencia de las bolsas de WhatsApp:
   * - Si `channels.whatsapp.enabled = true` y la bolsa global > 0, las 4 bolsas
   *   por categoría deben sumar exactamente la global (ninguna puede ser 0).
   * - Si el payload cambió la global, se **redistribuye** automáticamente
   *   (reparto igual; el resto a `utilidad`).
   * - Si solo cambiaron categorías, se **valida** la suma.
   * - Con global = 0 (ilimitada) o `enabled = false` (BYO) no hay restricción.
   */
  private applyWhatsappBagRules(
    merged: Record<string, any>,
    incomingKeys: string[],
    previousValues: Record<string, any> = {},
  ): void {
    const enabled = merged['channels.whatsapp.enabled'] === true;
    const global = Number(merged[WHATSAPP_GLOBAL_BAG_KEY] ?? 0);
    if (!enabled || !(global > 0)) return;

    const globalChanged =
      incomingKeys.includes(WHATSAPP_GLOBAL_BAG_KEY) &&
      Number(merged[WHATSAPP_GLOBAL_BAG_KEY] ?? 0) !==
        Number(previousValues[WHATSAPP_GLOBAL_BAG_KEY] ?? 0);

    if (globalChanged) {
      const base = Math.floor(global / WHATSAPP_CATEGORY_BAG_KEYS.length);
      const remainder = global % WHATSAPP_CATEGORY_BAG_KEYS.length;
      WHATSAPP_CATEGORY_BAG_KEYS.forEach((key, index) => {
        merged[key] = base + (index === 0 ? remainder : 0);
      });
      return;
    }

    let sum = 0;
    for (const key of WHATSAPP_CATEGORY_BAG_KEYS) {
      const value = Number(merged[key] ?? 0);
      if (!(value > 0)) {
        throw new BadRequestException(
          'Con una bolsa global de WhatsApp definida, cada categoría debe tener un tope mayor a 0.',
        );
      }
      sum += value;
    }
    if (sum !== global) {
      throw new BadRequestException(
        `La suma de las bolsas por categoría (${sum}) debe ser igual a "WhatsApp por mes" (${global}).`,
      );
    }
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
