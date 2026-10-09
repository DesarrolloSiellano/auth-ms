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
  'channels.whatsapp.platformPhoneNumberId',
  'channels.whatsapp.platformDisplayNumber',
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
    @InjectModel('Company')
    private readonly companyModel: Model<any>,
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

  /**
   * Filtro de búsqueda de config por identidad de tenant. Usa `company` y
   * `tenantId` juntos (ambos únicos) para garantizar la empresa correcta.
   */
  private tenantFilter(
    tenantId?: string,
    company?: string,
  ): Record<string, string> | null {
    const query: Record<string, string> = {};
    if (tenantId) query.tenantId = tenantId;
    if (company) query.company = company;
    return Object.keys(query).length > 0 ? query : null;
  }

  /**
   * Documento de config del tenant. La identidad es el par
   * `tenantId` + `company`: se busca por ambos cuando están disponibles.
   */
  private async findTenantConfig(
    tenantId?: string,
    company?: string,
  ): Promise<any> {
    const query = this.tenantFilter(tenantId, company);
    if (!query) return null;
    return this.tenantConfigModel.findOne(query).lean().exec();
  }

  /**
   * Nombre de la empresa a partir de su `tenantId` (que es `Company.id`,
   * RUT/NIT). Permite crear/rellenar la config con "uno por empresa".
   */
  private async resolveCompanyName(tenantId: string): Promise<string> {
    if (!tenantId) return '';
    const company = await this.companyModel
      .findOne({ $or: [{ id: tenantId }, { name: tenantId }] })
      .lean()
      .exec();
    return (company as any)?.name || '';
  }

  /**
   * Identidad canónica de una empresa a partir de su nombre o RUT/NIT.
   * Devuelve `{ id, name }` (tenantId = `Company.id`, company = `Company.name`).
   * Es la fuente de verdad para derivar el par multitenant.
   */
  async resolveCompanyIdentity(
    identifier: string,
  ): Promise<{ id: string; name: string } | null> {
    const value = String(identifier || '').trim();
    if (!value) return null;
    const company = await this.companyModel
      .findOne({
        $or: [{ id: value }, { name: value }],
        isActive: true,
      })
      .select('id name -_id')
      .lean()
      .exec();
    if (!company) return null;
    const id = String((company as any).id || '');
    const name = String((company as any).name || '');
    if (!id || !name) return null;
    return { id, name };
  }

  /** `Company.id` (RUT/NIT) a partir del nombre o id de la empresa. */
  async resolveCompanyId(identifier: string): Promise<string> {
    const identity = await this.resolveCompanyIdentity(identifier);
    return identity?.id || '';
  }

  /**
   * Resuelve y valida el par canónico de una empresa
   * (`company = Company.name`, `tenantId = Company.id`).
   *
   * - Con ambos: deben corresponder a la MISMA empresa activa.
   * - Con uno: se resuelve la empresa y se completa el otro.
   *
   * Devuelve `null` si no existe una empresa activa que cumpla.
   */
  async resolveCompanyPair(
    company?: string,
    tenantId?: string,
  ): Promise<{ id: string; name: string } | null> {
    const name = String(company || '').trim();
    const id = String(tenantId || '').trim();

    if (name && id) {
      const match = await this.companyModel
        .findOne({ name, id, isActive: true })
        .select('id name -_id')
        .lean()
        .exec();
      if (!match) return null;
      return { id: String((match as any).id), name: String((match as any).name) };
    }

    const identifier = name || id;
    if (!identifier) return null;
    return this.resolveCompanyIdentity(identifier);
  }

  /**
   * Rellena `company` en configs legadas (vacía/ausente) usando la empresa
   * real por `tenantId`. Necesario para el índice único de `company` y para
   * que la config siempre corresponda a la empresa correcta. Idempotente.
   */
  async backfillCompanyNames(): Promise<number> {
    const configs = await this.tenantConfigModel
      .find({
        $or: [
          { company: '' },
          { company: { $exists: false } },
          { company: null },
        ],
      })
      .lean()
      .exec();

    let updated = 0;
    for (const config of configs) {
      const name = await this.resolveCompanyName((config as any).tenantId);
      if (!name) continue;
      try {
        await this.tenantConfigModel
          .updateOne({ _id: (config as any)._id }, { $set: { company: name } })
          .exec();
        updated += 1;
      } catch (error: any) {
        this.logger.warn(
          `No se pudo rellenar company de la config ${(config as any).tenantId}: ${error?.message}`,
        );
      }
    }
    if (updated > 0) {
      this.logger.log(`Tenant config: ${updated} company(s) rellenadas.`);
    }
    return updated;
  }

  async resolveConfig(tenantId?: string, company?: string) {
    // Un documento por empresa: se crea al consultarse (idempotente).
    if (tenantId && company) {
      await this.ensureConfig(tenantId, company).catch(() => undefined);
    }

    const definitions = await this.policyDefinitionModel
      .find({ isActive: true })
      .lean()
      .exec();

    // Se busca por `company` + `tenantId` del usuario para garantizar que se
    // resuelve la empresa correcta.
    const config = await this.findTenantConfig(tenantId, company);

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
    if (!tenantId || !company) return false;
    const exists = await this.findTenantConfig(tenantId, company);
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
    // Se busca por `company` + `tenantId` del usuario (ambos únicos) para
    // resolver la empresa correcta.
    const config = await this.findTenantConfig(tenantId, company);
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
    const config = await this.findTenantConfig(tenantId, company);
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

  async getConfigByTenant(tenantId: string, company?: string) {
    const config = await this.findTenantConfig(tenantId, company);
    if (!config) {
      return this.resolveConfig(tenantId, company);
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

    // Discriminación por empresa: (tenantId, company).
    const filter: Record<string, any> = { tenantId: dto.tenantId };
    if (dto.company) filter.company = dto.company;

    const existing = await this.tenantConfigModel.findOne(filter).exec();

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

    const company =
      dto.company || (await this.resolveCompanyName(dto.tenantId)) || dto.tenantId;
    const merged = { ...sanitized };
    this.applyWhatsappBagRules(merged, incomingKeys);
    const created = await this.tenantConfigModel.create({
      tenantId: dto.tenantId,
      company,
      isActive: dto.isActive ?? true,
      version: 1,
      values: merged,
    });
    return this.wrapConfig(created.toObject());
  }

  async patchValues(
    tenantId: string,
    dto: PatchTenantConfigValuesDto,
    company?: string,
  ) {
    const sanitized = await this.sanitizeValues(dto.values || {});
    const incomingKeys = Object.keys(sanitized);

    const filter: Record<string, any> = { tenantId };
    if (company) filter.company = company;
    const existing = await this.tenantConfigModel.findOne(filter).exec();

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
    const companyName =
      company || (await this.resolveCompanyName(tenantId)) || tenantId;
    const created = await this.tenantConfigModel.create({
      tenantId,
      company: companyName,
      isActive: true,
      version: 1,
      values: allValues,
    });
    return this.wrapConfig(created.toObject());
  }

  /**
   * Coherencia de las bolsas de WhatsApp:
   * - Si la bolsa global > 0, las 4 bolsas por categoría deben sumar
   *   exactamente la global (ninguna puede ser 0).
   * - Si el payload cambió la global, se **redistribuye** automáticamente
   *   (reparto igual; el resto a `utilidad`).
   * - Si solo cambiaron categorías, se **valida** la suma.
   * - Con global = 0 (ilimitada) no hay restricción.
   */
  private applyWhatsappBagRules(
    merged: Record<string, any>,
    incomingKeys: string[],
    previousValues: Record<string, any> = {},
  ): void {
    const global = Number(merged[WHATSAPP_GLOBAL_BAG_KEY] ?? 0);
    if (!(global > 0)) return;

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
  async setValues(
    tenantId: string,
    values: Record<string, any>,
    company?: string,
  ) {
    return this.patchValues(tenantId, { values }, company);
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
