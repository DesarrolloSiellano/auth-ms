import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Response } from 'express';
import { User } from 'src/users/entities/user.entity';
import { Session } from 'src/sessions/entities/session.entity';
import { Company } from 'src/companies/entities/company.entity';
import { AuditService } from 'src/audit/audit.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { REPORT_DEFINITIONS } from './reports.registry';
import {
  ReportContext,
  ReportDefinition,
  ReportDeps,
  ReportFormat,
  ReportResult,
} from './interfaces/report.interface';
import { buildReportContext } from './helpers/report-context.helper';
import { streamStyledExcel } from './helpers/styled-excel.helper';
import { streamCsv } from './helpers/csv.helper';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Session') private readonly sessionModel: Model<Session>,
    @InjectModel('Company') private readonly companyModel: Model<Company>,
    private readonly tenantConfigService: TenantConfigService,
    private readonly auditService: AuditService,
  ) {}

  private isAllowed(user: any): boolean {
    return user?.isAdmin === true || user?.isSuperAdmin === true;
  }

  private assertAllowed(user: any): void {
    if (!this.isAllowed(user)) {
      throw new ForbiddenException('No tiene permiso para ver reportes');
    }
  }

  private findDefinition(id: string): ReportDefinition {
    const def = REPORT_DEFINITIONS.find((d) => d.id === id);
    if (!def) throw new NotFoundException(`Reporte "${id}" no encontrado`);
    return def;
  }

  private deps(): ReportDeps {
    return {
      userModel: this.userModel,
      sessionModel: this.sessionModel,
      companyModel: this.companyModel,
      tenantConfigService: this.tenantConfigService,
      auditService: this.auditService,
    };
  }

  private exportMaxRows(): number {
    return Number(process.env.REPORTS_EXPORT_MAX_ROWS) || 5000;
  }

  getCatalog(user: any) {
    this.assertAllowed(user);
    const data = REPORT_DEFINITIONS.map((def) => ({
      id: def.id,
      nombre: def.nombre,
      descripcion: def.descripcion,
      category: def.category,
      filters: def.filters,
      formats: ['xlsx', 'csv'],
    }));
    return {
      message: 'Catálogo de reportes',
      data,
      meta: { totalData: data.length },
    };
  }

  private async runReport(
    id: string,
    filters: any,
    user: any,
    exporting = false,
  ): Promise<{ def: ReportDefinition; ctx: ReportContext; result: ReportResult }> {
    this.assertAllowed(user);
    const def = this.findDefinition(id);
    const ctx = buildReportContext(user);
    // `__export` permite que los reportes paginados devuelvan el dataset
    // completo al exportar (sin romper la paginación de la vista previa).
    const effectiveFilters = exporting
      ? { ...(filters || {}), __export: true }
      : filters || {};
    const result = await def.build(ctx, effectiveFilters, this.deps());
    return { def, ctx, result };
  }

  async preview(id: string, filters: any, user: any, limit = 50) {
    const { def, ctx, result } = await this.runReport(id, filters, user);
    const rows = (result.rows || []).slice(0, limit);
    return {
      message: 'Vista previa del reporte',
      data: {
        id: def.id,
        nombre: def.nombre,
        descripcion: def.descripcion,
        category: def.category,
        columns: result.columns,
        rows,
        summary: result.summary || [],
        chart: result.chart || null,
        total: (result.rows || []).length,
        generatedBy: ctx.userName,
        generatedAt: new Date().toISOString(),
      },
      meta: { totalData: rows.length, total: (result.rows || []).length },
    };
  }

  /**
   * Dataset completo (o hasta el tope configurado) en JSON. Lo consume el
   * frontend para generar el PDF vía impresión del navegador.
   */
  async data(id: string, filters: any, user: any, limit?: number) {
    const { def, ctx, result } = await this.runReport(id, filters, user, true);
    const max = this.exportMaxRows();
    const cap = limit && limit > 0 ? Math.min(limit, max) : max;
    const all = result.rows || [];
    const rows = all.slice(0, cap);
    return {
      message: 'Datos del reporte',
      data: {
        id: def.id,
        nombre: def.nombre,
        descripcion: def.descripcion,
        category: def.category,
        columns: result.columns,
        rows,
        summary: result.summary || [],
        chart: result.chart || null,
        total: all.length,
        truncated: all.length > rows.length,
        generatedBy: ctx.userName,
        generatedAt: new Date().toISOString(),
      },
      meta: { totalData: rows.length, total: all.length, limit: cap, max },
    };
  }

  /**
   * Exportación server-side en streaming (xlsx/csv). El PDF se genera en el
   * frontend con la impresión del navegador (sin Puppeteer).
   */
  async exportStream(
    id: string,
    filters: any,
    format: ReportFormat,
    user: any,
    res: Response,
  ): Promise<void> {
    if (format !== 'xlsx' && format !== 'csv') {
      throw new BadRequestException(
        'Formato no soportado en el servidor. Use xlsx o csv (el PDF se genera en el navegador).',
      );
    }

    const { def, ctx, result } = await this.runReport(
      id,
      filters,
      user,
      true,
    );

    const meta = `Generado: ${new Date().toLocaleString('es-CO')} · Usuario: ${ctx.userName}${
      ctx.tenantLabel ? ' · ' + ctx.tenantLabel : ''
    }`;
    const baseName = `${def.id}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${baseName}.csv"`,
      );
      streamCsv(res as unknown as NodeJS.WritableStream, result.columns, result.rows || []);
      return;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${baseName}.xlsx"`,
    );
    await streamStyledExcel(res as unknown as NodeJS.WritableStream, {
      title: def.nombre,
      meta,
      columns: result.columns,
      rows: result.rows || [],
      summary: result.summary,
      sheetName: def.nombre,
    });
  }
}
