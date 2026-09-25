import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as generatePassword from 'generate-password';
import { User } from './entities/user.entity';
import { SavedFilter } from './entities/saved-filter.entity';
import { CustomFieldDefinition } from './entities/custom-field-definition.entity';
import { toPublicUser } from './helpers/user.sanitizer';
import { MailService } from 'src/mail/mail.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { SessionsService } from 'src/sessions/sessions.service';
import { AuditService } from 'src/audit/audit.service';
import type { Response } from 'express';
import { streamCsv } from 'src/reports/helpers/csv.helper';
import { streamStyledExcel } from 'src/reports/helpers/styled-excel.helper';
import {
  ReportColumn,
  ReportFormat,
} from 'src/reports/interfaces/report.interface';

export type BulkAction =
  | 'activate'
  | 'deactivate'
  | 'resetPassword'
  | 'assignRoles'
  | 'assignModules'
  | 'revokeSessions'
  | 'delete';

const ADMIN_ALLOWED_ACTIONS: BulkAction[] = [
  'activate',
  'deactivate',
  'resetPassword',
  'delete',
];

const SUPER_ONLY_ACTIONS: BulkAction[] = [
  'assignRoles',
  'assignModules',
  'revokeSessions',
];

@Injectable()
export class UserAdminService {
  private readonly logger = new Logger(UserAdminService.name);

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('SavedFilter')
    private readonly savedFilterModel: Model<SavedFilter>,
    @InjectModel('CustomFieldDefinition')
    private readonly customFieldModel: Model<CustomFieldDefinition>,
    @InjectModel('Rol') private readonly rolModel: Model<any>,
    @InjectModel('Module') private readonly moduleModel: Model<any>,
    private readonly mailService: MailService,
    private readonly tenantConfigService: TenantConfigService,
    private readonly sessionsService: SessionsService,
    private readonly auditService: AuditService,
  ) {}

  // ------------------------------------------------------------------ Util

  private audit(
    requester: any,
    action: string,
    detail: Record<string, any>,
    status: 'success' | 'failed' = 'success',
  ): void {
    this.auditService.logAsync({
      action,
      category: 'user',
      status,
      userId: requester?._id ? String(requester._id) : undefined,
      email: requester?.email,
      company: requester?.company,
      tenantId: requester?.tenantId,
      detail,
    });
  }

  private scope(requester: any, extra: Record<string, any> = {}) {
    const query: any = { deletedAt: null, ...extra };
    if (!requester?.isSuperAdmin) {
      query.company = requester?.company;
    }
    return query;
  }

  private assertStaff(requester: any): void {
    if (
      !requester?.isAdmin &&
      !requester?.isSuperAdmin &&
      !requester?.isService
    ) {
      throw new ForbiddenException(
        'No tienes permiso para administrar usuarios',
      );
    }
  }

  private assertCanManageTarget<T>(target: T | null, requester: any): T {
    if (!target) throw new NotFoundException('Usuario no encontrado');
    const t: any = target;
    if (requester?.isService) {
      if (requester.company && t.company !== requester.company) {
        throw new ForbiddenException('No puedes operar sobre otra empresa');
      }
      return target;
    }
    if (!requester?.isSuperAdmin && t.company !== requester?.company) {
      throw new ForbiddenException('No puedes operar sobre otra empresa');
    }
    if (!requester?.isSuperAdmin && t.isSuperAdmin) {
      throw new ForbiddenException('No puedes operar sobre un SuperAdmin');
    }
    return target;
  }

  private assertNotSelf(target: any, requester: any, verb: string): void {
    if (
      target?._id &&
      requester?._id &&
      String(target._id) === String(requester._id)
    ) {
      throw new BadRequestException(`No puedes ${verb} tu propio usuario`);
    }
  }

  private token(): { raw: string; hash: string; expires: Date } {
    const raw = crypto.randomBytes(32).toString('hex');
    return {
      raw,
      hash: crypto.createHash('sha256').update(raw).digest('hex'),
      expires: new Date(Date.now() + 48 * 60 * 60 * 1000),
    };
  }

  private frontUrl(redirectUri?: string): string {
    return (
      redirectUri || process.env.APP_URL || 'https://app.bponet.com.co'
    );
  }

  // --------------------------------------------------------------- Búsqueda

  private buildSearchQuery(
    requester: any,
    filters: any = {},
  ): Record<string, any> {
    const query: any = { deletedAt: null };
    if (!requester?.isSuperAdmin) {
      query.company = requester?.company;
    } else if (filters.company) {
      query.company = new RegExp(filters.company, 'i');
    }

    if (filters.estado !== undefined && filters.estado !== '') {
      query.isActived = String(filters.estado) === 'true';
    }
    if (String(filters.isBlocked).toLowerCase() === 'true') {
      query.isBlocked = true;
    } else if (String(filters.isBlocked).toLowerCase() === 'false') {
      query.isBlocked = false;
    }

    const and: any[] = [];
    if (filters.rol) {
      const rx = new RegExp(filters.rol, 'i');
      and.push({ $or: [{ 'roles.codeRol': rx }, { 'roles.name': rx }] });
    }
    if (filters.email) query.email = new RegExp(filters.email, 'i');
    if (filters.username) query.username = new RegExp(filters.username, 'i');
    if (filters.phone) query.phone = new RegExp(filters.phone, 'i');
    if (filters.tags) {
      const list = String(filters.tags)
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (list.length) query.tags = { $in: list };
    }
    if (filters.groups) {
      const list = String(filters.groups)
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      if (list.length) query.groups = { $in: list };
    }
    if (filters.desde || filters.hasta) {
      const range: any = {};
      if (filters.desde) range.$gte = new Date(filters.desde);
      if (filters.hasta) range.$lte = new Date(`${filters.hasta}T23:59:59.999Z`);
      query.created = range;
    }
    if (filters.global) {
      const rx = new RegExp(filters.global, 'i');
      and.push({
        $or: [
          { name: rx },
          { lastName: rx },
          { email: rx },
          { username: rx },
          { phone: rx },
        ],
      });
    }
    if (and.length) query.$and = and;
    return query;
  }

  // ------------------------------------------------------------- Exportación

  private async buildUserExport(requester: any, filters: any): Promise<{
    columns: ReportColumn[];
    rows: Record<string, any>[];
  }> {
    const query = this.buildSearchQuery(requester, filters);
    const users = await this.userModel
      .find(query)
      .sort({ created: -1 })
      .limit(10000)
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const columns: ReportColumn[] = [
      { key: 'nombre', label: 'Nombre' },
      { key: 'email', label: 'Correo' },
      { key: 'username', label: 'Usuario' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'company', label: 'Empresa' },
      { key: 'roles', label: 'Roles' },
      { key: 'estado', label: 'Estado', align: 'center' },
      { key: 'bloqueado', label: 'Bloqueado', align: 'center' },
      { key: 'tags', label: 'Etiquetas' },
      { key: 'groups', label: 'Grupos' },
      { key: 'creado', label: 'Creado', type: 'date', align: 'center' },
    ];

    const rows = users.map((u: any) => ({
      nombre: `${u.name || ''} ${u.lastName || ''}`.trim(),
      email: u.email || '',
      username: u.username || '',
      phone: u.phone || '',
      company: u.company || '',
      roles: (u.roles || [])
        .map((r: any) => r.codeRol || r.name)
        .filter(Boolean)
        .join(', '),
      estado: u.isActived ? 'Activo' : 'Inactivo',
      bloqueado: u.isBlocked ? 'Sí' : 'No',
      tags: (u.tags || []).join(', '),
      groups: (u.groups || []).join(', '),
      creado: u.created || '',
    }));

    return { columns, rows };
  }

  /** Dataset de usuarios en JSON (hasta el tope) para el PDF del navegador. */
  async exportData(requester: any, filters: any, limit?: number) {
    this.assertStaff(requester);
    const max = Number(process.env.REPORTS_EXPORT_MAX_ROWS) || 5000;
    const cap = limit && limit > 0 ? Math.min(limit, max) : max;
    const { columns, rows } = await this.buildUserExport(requester, filters);
    const pageRows = rows.slice(0, cap);
    return {
      message: 'Datos de usuarios',
      data: {
        columns,
        rows: pageRows,
        total: rows.length,
        truncated: rows.length > pageRows.length,
        generatedAt: new Date().toISOString(),
      },
      meta: {
        totalData: pageRows.length,
        total: rows.length,
        limit: cap,
        max,
      },
    };
  }

  /** Exportación server-side en streaming (xlsx/csv). */
  async exportStream(
    requester: any,
    filters: any,
    format: ReportFormat,
    res: Response,
  ): Promise<void> {
    this.assertStaff(requester);
    if (format !== 'xlsx' && format !== 'csv') {
      throw new BadRequestException(
        'Formato no soportado en el servidor. Use xlsx o csv (el PDF se genera en el navegador).',
      );
    }

    const { columns, rows } = await this.buildUserExport(requester, filters);
    const meta = `Generado: ${new Date().toLocaleString('es-CO')} · Usuario: ${requester?.email || ''}`;
    const base = `usuarios_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${base}.csv"`,
      );
      streamCsv(res as unknown as NodeJS.WritableStream, columns, rows);
      return;
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${base}.xlsx"`,
    );
    await streamStyledExcel(res as unknown as NodeJS.WritableStream, {
      title: 'Usuarios',
      meta,
      columns,
      rows,
      sheetName: 'Usuarios',
    });
  }

  // --------------------------------------------------------------- Eliminar

  async softRemove(id: string, requester: any) {
    this.assertStaff(requester);
    const target = await this.userModel
      .findOne(this.scope(requester, { _id: id }))
      .lean()
      .exec();
    this.assertCanManageTarget(target, requester);
    this.assertNotSelf(target, requester, 'desactivar/eliminar');

    const updated = await this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { deletedAt: new Date(), isActived: false } },
        { new: true },
      )
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    this.audit(requester, 'user.soft_deleted', { targetId: id });
    return toPublicUser(updated as any);
  }

  async hardRemove(id: string, requester: any) {
    if (!requester?.isSuperAdmin && !requester?.isService) {
      throw new ForbiddenException(
        'Solo un SuperAdmin puede eliminar definitivamente',
      );
    }
    const target = await this.userModel.findById(id).lean().exec();
    this.assertNotSelf(target, requester, 'eliminar');

    const deleted = await this.userModel
      .findByIdAndDelete(id)
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    if (!deleted) throw new NotFoundException('Usuario no encontrado');

    this.audit(requester, 'user.hard_deleted', { targetId: id });
    return toPublicUser(deleted);
  }

  // --------------------------------------------------------------- Bloqueo

  async block(
    id: string,
    requester: any,
    options: { reason?: string; until?: string } = {},
  ) {
    this.assertStaff(requester);
    const target = await this.userModel
      .findOne(this.scope(requester, { _id: id }))
      .lean()
      .exec();
    this.assertCanManageTarget(target, requester);

    const until = options.until ? new Date(options.until) : null;
    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            isBlocked: true,
            blockReason: options.reason || 'manual',
            blockedUntil: until,
            failedLoginAttempts: 0,
          },
        },
      )
      .setOptions({ bypassTenant: true })
      .exec();

    this.audit(requester, 'user.blocked', { targetId: id, until });
    return { message: 'Usuario bloqueado', data: { _id: id } };
  }

  async unblock(id: string, requester: any) {
    this.assertStaff(requester);
    const target = await this.userModel
      .findOne(this.scope(requester, { _id: id }))
      .lean()
      .exec();
    this.assertCanManageTarget(target, requester);

    await this.userModel
      .updateOne(
        { _id: id },
        {
          $set: {
            isBlocked: false,
            blockReason: null,
            blockedUntil: null,
            failedLoginAttempts: 0,
          },
        },
      )
      .setOptions({ bypassTenant: true })
      .exec();

    this.audit(requester, 'user.unblocked', { targetId: id });
    return { message: 'Usuario desbloqueado', data: { _id: id } };
  }

  // ----------------------------------------------------------- Etiquetas

  async setTagsGroups(
    id: string,
    requester: any,
    data: { tags?: string[]; groups?: string[] },
  ) {
    this.assertStaff(requester);
    const target = await this.userModel
      .findOne(this.scope(requester, { _id: id }))
      .lean()
      .exec();
    this.assertCanManageTarget(target, requester);

    const update: any = {};
    if (Array.isArray(data.tags)) update.tags = data.tags;
    if (Array.isArray(data.groups)) update.groups = data.groups;

    await this.userModel
      .updateOne({ _id: id }, { $set: update })
      .setOptions({ bypassTenant: true })
      .exec();

    this.audit(requester, 'user.tags.updated', { targetId: id, ...update });
    return { message: 'Etiquetas/grupos actualizados', data: { _id: id } };
  }

  // ---------------------------------------------------------- Acciones masivas

  private assertBulkAllowed(requester: any, action: BulkAction): void {
    if (!requester?.isAdmin && !requester?.isSuperAdmin && !requester?.isService) {
      throw new ForbiddenException('No tienes permiso');
    }
    if (requester?.isService || requester?.isSuperAdmin) return;
    if (!requester?.isSuperAdmin) {
      if (SUPER_ONLY_ACTIONS.includes(action)) {
        throw new ForbiddenException(
          `La acción "${action}" requiere SuperAdmin`,
        );
      }
      if (!ADMIN_ALLOWED_ACTIONS.includes(action)) {
        throw new ForbiddenException(`Acción no permitida: ${action}`);
      }
    }
  }

  private validIds(ids: string[]): string[] {
    return (ids || []).filter((id) => Types.ObjectId.isValid(id));
  }

  async bulkAction(
    requester: any,
    action: BulkAction,
    ids: string[],
    payload: any = {},
  ) {
    this.assertBulkAllowed(requester, action);
    const valid = this.validIds(ids);
    if (valid.length === 0) {
      throw new BadRequestException('No se recibieron usuarios válidos');
    }

    const query: any = this.scope(requester, { _id: { $in: valid } });
    const results: Array<{ id: string; status: string; message?: string }> = [];

    if (action === 'activate' || action === 'deactivate') {
      const isActive = action === 'activate';
      const finalQuery = { ...query };
      if (!isActive && requester?._id) {
        finalQuery._id = { $in: valid.filter((i) => i !== String(requester._id)) };
      }
      const res = await this.userModel
        .updateMany(finalQuery, { $set: { isActived: isActive } })
        .setOptions({ bypassTenant: true })
        .exec();
      this.audit(requester, `user.bulk.${action}`, { ids: valid });
      return {
        message: 'Acción masiva aplicada',
        data: { action, modified: res.modifiedCount ?? 0 },
        meta: { totalData: res.modifiedCount ?? 0 },
      };
    }

    if (action === 'resetPassword') {
      for (const id of valid) {
        const user = await this.userModel.findById(id).lean().exec();
        if (!user || user.isSuperAdmin || user.deletedAt) {
          results.push({ id, status: 'skipped', message: 'No elegible' });
          continue;
        }
        const tempPassword = this.generateTempPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, 10);
        await this.userModel
          .updateOne(
            { _id: id },
            {
              $set: {
                password: hashedPassword,
                mustChangePassword: true,
                isNewUser: true,
                failedLoginAttempts: 0,
                isBlocked: false,
                blockedUntil: null,
              },
            },
          )
          .setOptions({ bypassTenant: true })
          .exec();

        // Igual que la recuperación: contraseña temporal por correo.
        try {
          await this.mailService.sendEmail({
            to: user.email,
            subject: 'Recuperación de contraseña - BpoNet',
            template: 'recovery',
            context: {
              name: user.name,
              platform_name: 'BpoNet',
              temporary_password: tempPassword,
              login_url: this.frontUrl(),
            },
          });
          results.push({ id, status: 'reset', message: 'Correo enviado' });
        } catch (mailError: any) {
          this.logger.error(
            `No se pudo enviar el correo de reseteo a ${user.email}: ${mailError?.message}`,
          );
          results.push({
            id,
            status: 'reset',
            message: 'Contraseña reseteada, correo no enviado',
          });
        }
      }
      this.audit(requester, 'user.bulk.resetPassword', { ids: valid });
      return {
        message: 'Contraseñas restablecidas',
        data: { action, results },
        meta: { totalData: results.length },
      };
    }

    if (action === 'revokeSessions') {
      let revoked = 0;
      for (const id of valid) {
        revoked += await this.sessionsService.revokeByUser(
          id,
          requester?.isSuperAdmin ? undefined : requester?.company,
        );
      }
      this.audit(requester, 'user.bulk.revokeSessions', { ids: valid, revoked });
      return {
        message: 'Sesiones revocadas',
        data: { action, revoked },
        meta: { totalData: revoked },
      };
    }

    if (action === 'assignRoles' || action === 'assignModules') {
      const field = action === 'assignRoles' ? 'roles' : 'modules';
      const values = Array.isArray(payload?.[field]) ? payload[field] : [];
      if (values.length === 0) {
        throw new BadRequestException(`Debes enviar ${field}`);
      }
      const resolved =
        field === 'roles'
          ? values.map((r: any) => ({
              name: r.name || r,
              codeRol: r.codeRol || r,
              description: r.description || '',
              isActive: true,
              isInheritPermissions: false,
              permissions: [],
            }))
          : values.map((m: any) => ({
              name: m.name || m,
              description: m.description || '',
              isActive: true,
              isSystemModule: false,
              routes: [],
            }));

      const res = await this.userModel
        .updateMany(query, { $set: { [field]: resolved } })
        .setOptions({ bypassTenant: true })
        .exec();
      this.audit(requester, `user.bulk.${action}`, { ids: valid });
      return {
        message: 'Asignación aplicada',
        data: { action, modified: res.modifiedCount ?? 0 },
        meta: { totalData: res.modifiedCount ?? 0 },
      };
    }

    if (action === 'delete') {
      const hard = payload?.hard === true;
      if (hard && !requester?.isSuperAdmin && !requester?.isService) {
        throw new ForbiddenException('Solo un SuperAdmin puede borrar');
      }
      const finalIds = valid.filter((i) => i !== String(requester?._id));
      let affected = 0;
      if (hard) {
        const res = await this.userModel
          .deleteMany({ _id: { $in: finalIds } })
          .setOptions({ bypassTenant: true })
          .exec();
        affected = res.deletedCount ?? 0;
      } else {
        const res = await this.userModel
          .updateMany(
            { ...query, _id: { $in: finalIds } },
            { $set: { deletedAt: new Date(), isActived: false } },
          )
          .setOptions({ bypassTenant: true })
          .exec();
        affected = res.modifiedCount ?? 0;
      }
      this.audit(requester, hard ? 'user.bulk.hardDelete' : 'user.bulk.softDelete', {
        ids: finalIds,
      });
      return {
        message: 'Eliminación aplicada',
        data: { action, hard, affected },
        meta: { totalData: affected },
      };
    }

    throw new BadRequestException(
      `Acción no soportada: ${action as string}`,
    );
  }

  /** Contraseña temporal segura (idéntica a la de recuperación de contraseña). */
  private generateTempPassword(): string {
    return generatePassword.generate({
      length: 12,
      numbers: true,
      uppercase: true,
      symbols: true,
      strict: true,
    });
  }

  // ------------------------------------------------------- Reenviar correo

  async resendInvite(id: string, requester: any) {
    this.assertStaff(requester);
    const user = this.assertCanManageTarget(
      await this.userModel.findOne(this.scope(requester, { _id: id })).exec(),
      requester,
    );

    const hasValidToken =
      user.passwordResetToken &&
      user.passwordResetExpires &&
      new Date(user.passwordResetExpires).getTime() > Date.now();

    if (hasValidToken) {
      const t = this.token();
      user.passwordResetToken = t.hash;
      user.passwordResetExpires = t.expires;
      await user.save();
      void this.mailService
        .sendEmail({
          to: user.email,
          subject: 'Invitación a BpoNet',
          template: 'welcome',
          context: {
            name: user.name,
            platform_name: 'BpoNet',
            username: user.username || user.email,
            password: '(usa el enlace de invitación)',
            login_url: `${this.frontUrl()}/set-password?token=${t.raw}`,
          },
        })
        .catch(() => undefined);
      this.audit(requester, 'user.invite.resent', { targetId: id });
      return { message: 'Invitación reenviada' };
    }

    const temp = this.generateTempPassword();
    user.password = temp;
    user.isNewUser = true;
    user.mustChangePassword = true;
    await user.save();
    void this.mailService
      .sendEmail({
        to: user.email,
        subject: 'Bienvenido a BpoNet - Activa tu cuenta',
        template: 'welcome',
        context: {
          name: user.name,
          platform_name: 'BpoNet',
          username: user.username || user.email,
          password: temp,
          login_url: this.frontUrl(),
        },
      })
      .catch(() => undefined);
    this.audit(requester, 'user.welcome.resent', { targetId: id });
    return { message: 'Correo de bienvenida reenviado' };
  }

  // -------------------------------------------------- Búsquedas guardadas

  async listSavedFilters(requester: any) {
    const query: any = {
      module: 'users',
      $or: [
        { userId: String(requester?._id) },
        { isShared: true, company: requester?.company },
      ],
    };
    const data = await this.savedFilterModel
      .find(query)
      .sort({ createdAt: -1 })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    return { message: 'Búsquedas guardadas', data, meta: { totalData: data.length } };
  }

  async createSavedFilter(
    requester: any,
    dto: { name: string; filters: any; isShared?: boolean },
  ) {
    this.assertStaff(requester);
    if (!dto?.name) throw new BadRequestException('El nombre es obligatorio');
    const created = await this.savedFilterModel.create({
      userId: String(requester?._id),
      name: dto.name,
      module: 'users',
      filters: dto.filters || {},
      isShared: dto.isShared === true,
      company: requester?.company,
      tenantId: requester?.tenantId || requester?.company,
    });
    this.audit(requester, 'user.filters.saved', { name: dto.name });
    return { message: 'Búsqueda guardada', data: created.toObject() };
  }

  async deleteSavedFilter(id: string, requester: any) {
    const query: any = { _id: id };
    if (!requester?.isSuperAdmin) {
      query.userId = String(requester?._id);
    }
    const deleted = await this.savedFilterModel
      .findOneAndDelete(query)
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    if (!deleted) throw new NotFoundException('Búsqueda no encontrada');
    this.audit(requester, 'user.filters.deleted', { id });
    return { message: 'Búsqueda eliminada' };
  }

  // ------------------------------------------------- Campos personalizados

  /**
   * Valida y normaliza `customFields` contra las definiciones activas de la
   * empresa. Lanza BadRequest si falta un campo obligatorio o el tipo no es
   * válido. Si no hay empresa resoluble, devuelve el valor tal cual.
   */
  async validateCustomFields(
    company: string | undefined,
    _tenantId: string | undefined,
    input: any,
  ): Promise<Record<string, any>> {
    const data = input && typeof input === 'object' ? input : {};
    if (!company) return data;

    const defs = await this.customFieldModel
      .find({ company, isActive: true })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const result: Record<string, any> = {};
    for (const def of defs) {
      let value = data[def.key];
      const empty = value === undefined || value === null || value === '';
      if (empty) {
        if (def.required) {
          throw new BadRequestException(
            `El campo "${def.label}" es obligatorio`,
          );
        }
        continue;
      }
      switch (def.type) {
        case 'number': {
          const n = Number(value);
          if (Number.isNaN(n)) {
            throw new BadRequestException(`"${def.label}" debe ser numérico`);
          }
          value = n;
          break;
        }
        case 'boolean': {
          value = value === true || value === 'true';
          break;
        }
        case 'date': {
          const d = new Date(value);
          if (Number.isNaN(d.getTime())) {
            throw new BadRequestException(
              `"${def.label}" debe ser una fecha válida`,
            );
          }
          value = d;
          break;
        }
        case 'select': {
          const allowed = (def.options || []).map((o: any) => o.value);
          if (allowed.length > 0 && !allowed.includes(value)) {
            throw new BadRequestException(
              `"${def.label}" no es una opción válida`,
            );
          }
          break;
        }
        default:
          value = String(value);
      }
      result[def.key] = value;
    }
    return result;
  }

  async listCustomFields(requester: any, company?: string) {
    const targetCompany = requester?.isSuperAdmin
      ? company || requester?.company
      : requester?.company;
    const query: any = { isActive: true };
    if (targetCompany) query.company = targetCompany;
    const data = await this.customFieldModel
      .find(query)
      .sort({ order: 1 })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    return { message: 'Campos personalizados', data, meta: { totalData: data.length } };
  }

  async createCustomField(requester: any, dto: any) {
    if (!requester?.isSuperAdmin) {
      throw new ForbiddenException('Solo un SuperAdmin puede definir campos');
    }
    if (!dto?.key || !dto?.label) {
      throw new BadRequestException('key y label son obligatorios');
    }
    const created = await this.customFieldModel.create({
      ...dto,
      company: dto.company || requester?.company,
      tenantId: dto.tenantId || requester?.tenantId || requester?.company,
      order: dto.order ?? 0,
      isActive: dto.isActive ?? true,
    });
    this.audit(requester, 'customfield.created', { key: dto.key });
    return { message: 'Campo creado', data: created.toObject() };
  }

  async updateCustomField(id: string, requester: any, dto: any) {
    if (!requester?.isSuperAdmin) {
      throw new ForbiddenException('Solo un SuperAdmin puede definir campos');
    }
    const updated = await this.customFieldModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    if (!updated) throw new NotFoundException('Campo no encontrado');
    this.audit(requester, 'customfield.updated', { id });
    return { message: 'Campo actualizado', data: updated };
  }

  async deleteCustomField(id: string, requester: any) {
    if (!requester?.isSuperAdmin) {
      throw new ForbiddenException('Solo un SuperAdmin puede definir campos');
    }
    const deleted = await this.customFieldModel
      .findByIdAndDelete(id)
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    if (!deleted) throw new NotFoundException('Campo no encontrado');
    this.audit(requester, 'customfield.deleted', { id });
    return { message: 'Campo eliminado' };
  }
}
