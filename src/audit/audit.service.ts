import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditEntry {
  action: string;
  category: AuditLog['category'];
  status?: AuditLog['status'];
  tenantId?: string;
  company?: string;
  userId?: string;
  email?: string;
  ip?: string;
  userAgent?: string;
  browser?: string;
  os?: string;
  device?: string;
  detail?: Record<string, any>;
}

export interface AuditScope {
  isSuperAdmin: boolean;
  company?: string;
}

export interface AuditMineOptions {
  page?: number;
  limit?: number;
  category?: string;
  status?: string;
  action?: string;
  from?: string;
  to?: string;
}

export interface AuditReportOptions {
  page?: number;
  limit?: number;
  all?: boolean;
}

/**
 * Eventos de bajo valor que NO se registran (evitan ruido en el historial).
 * `refresh` se dispara en cada renovación de token; los `user.filters.*` son
 * acciones de UI de bajo impacto.
 */
const DISABLED_ACTIONS = new Set<string>([
  'refresh',
  'user.filters.saved',
  'user.filters.deleted',
]);

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const REPORT_EXPORT_MAX = 10000;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel('AuditLog') private readonly auditModel: Model<AuditLog>,
  ) {}

  /**
   * Registra un evento de auditoría. Nunca lanza: la auditoría no debe
   * romper el flujo principal (login, refresh, revocación, etc.).
   */
  async log(entry: AuditEntry): Promise<void> {
    // Eventos de bajo valor: se omiten por configuración.
    if (DISABLED_ACTIONS.has(entry.action)) return;

    try {
      await this.auditModel.create({
        ...entry,
        status: entry.status || 'success',
        detail: entry.detail || {},
      });
    } catch (error: any) {
      this.logger.warn(`No se pudo registrar auditoría: ${error?.message}`);
    }
  }

  /** Versión no bloqueante (fire-and-forget) para flujos críticos. */
  logAsync(entry: AuditEntry): void {
    void this.log(entry);
  }

  /**
   * Historial de auditoría del propio usuario, paginado y con filtros
   * (categoría, estado, acción y rango de fechas).
   */
  async findMine(userId: string, options: AuditMineOptions = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(
      Math.max(1, Number(options.limit) || DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const query: any = { userId };
    if (options.category) query.category = options.category;
    if (options.status) query.status = options.status;
    if (options.action) {
      query.action = new RegExp(this.escapeRegExp(options.action), 'i');
    }
    this.applyDateRange(query, options.from, options.to);

    const [data, totalData] = await Promise.all([
      this.auditModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .setOptions({ bypassTenant: true })
        .lean()
        .exec(),
      this.auditModel
        .countDocuments(query)
        .setOptions({ bypassTenant: true })
        .exec(),
    ]);

    return {
      message: 'Auditoría del usuario',
      data,
      meta: { totalData, page, limit },
    };
  }

  /**
   * Consulta de auditoría para el reporte. Por defecto pagina; con
   * `all=true` (exportación) devuelve hasta un máximo seguro.
   */
  async findForReport(
    filters: any = {},
    scope: AuditScope = { isSuperAdmin: false },
    options: AuditReportOptions = {},
  ): Promise<{ data: AuditLog[]; total: number }> {
    const query: any = {};
    if (!scope.isSuperAdmin) {
      query.company = scope.company || '__none__';
    }
    if (filters.category) query.category = filters.category;
    if (filters.status) query.status = filters.status;
    if (filters.action) {
      query.action = new RegExp(this.escapeRegExp(filters.action), 'i');
    }
    if (filters.email) {
      query.email = new RegExp(this.escapeRegExp(filters.email), 'i');
    }
    this.applyDateRange(query, filters.desde, filters.hasta);

    if (options.all) {
      const data = await this.auditModel
        .find(query)
        .sort({ createdAt: -1 })
        .limit(REPORT_EXPORT_MAX)
        .setOptions({ bypassTenant: true })
        .lean()
        .exec();
      return { data, total: data.length };
    }

    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(
      Math.max(1, Number(options.limit) || MAX_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );

    const [data, total] = await Promise.all([
      this.auditModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .setOptions({ bypassTenant: true })
        .lean()
        .exec(),
      this.auditModel
        .countDocuments(query)
        .setOptions({ bypassTenant: true })
        .exec(),
    ]);

    return { data, total };
  }

  private applyDateRange(query: any, from?: string, to?: string): void {
    if (!from && !to) return;
    const range: any = {};
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(`${to}T23:59:59.999Z`);
    query.createdAt = range;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
