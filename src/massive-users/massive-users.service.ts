import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as generatePassword from 'generate-password';
import * as XLSX from 'xlsx';

import { User } from 'src/users/entities/user.entity';
import { Rol } from 'src/roles/entities/role.entity';
import { Permission } from 'src/permissions/entities/permission.entity';
import { Module } from 'src/modules/entities/module.entity';
import { Company } from 'src/companies/entities/company.entity';
import { MailService } from 'src/mail/mail.service';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import {
  MassiveUploadReportDto,
  MassiveUserStatus,
} from './dto/massive-upload-response.dto';

const HEADER = {
  name: 'Nombres',
  lastName: 'Apellidos',
  email: 'Correo Electrónico',
  phone: 'Teléfono',
  username: 'Usuario',
  tenantId: 'TenantId',
  company: 'Empresa',
  roles: 'Roles',
  permissions: 'Permisos',
  modules: 'Módulos',
};

const BASE_REQUIRED_HEADERS = [
  HEADER.name,
  HEADER.lastName,
  HEADER.email,
];

// El SuperAdmin debe indicar la empresa/tenant en el archivo; un admin normal
// hereda la suya y por tanto esas columnas no son obligatorias.
const SUPERADMIN_REQUIRED_HEADERS = [HEADER.tenantId, HEADER.company];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface MassiveUploadRequester {
  _id?: any;
  company?: string;
  tenantId?: string;
  isAdmin?: boolean;
  isSuperAdmin?: boolean;
}

@Injectable()
export class MassiveUsersService {
  private readonly logger = new Logger(MassiveUsersService.name);
  private readonly MAX_USERS_PER_FILE = 50;

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Rol') private readonly rolModel: Model<Rol>,
    @InjectModel('Permission')
    private readonly permissionModel: Model<Permission>,
    @InjectModel('Module') private readonly moduleModel: Model<Module>,
    @InjectModel('Company') private readonly companyModel: Model<Company>,
    private readonly mailService: MailService,
    private readonly tenantConfigService: TenantConfigService,
  ) {}

  async processExcel(
    file: any,
    requester: MassiveUploadRequester,
  ): Promise<{
    message: string;
    statusCode: number;
    status: string;
    data: MassiveUploadReportDto;
  }> {
    if (!file) {
      throw new BadRequestException('No se ha proporcionado ningún archivo');
    }

    const fileName = String(file.originalname || '');
    if (!/\.(xlsx|xls)$/i.test(fileName)) {
      throw new BadRequestException(
        'El archivo debe tener formato Excel (.xlsx o .xls)',
      );
    }

    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('El archivo está vacío');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(file.buffer, { type: 'buffer' });
    } catch {
      throw new BadRequestException('El archivo no es un Excel válido');
    }

    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) {
      throw new BadRequestException('El archivo Excel no contiene hojas');
    }

    const sheet = workbook.Sheets[sheetName];
    const headerRows: any[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
    });
    const headerRow = (headerRows[0] || []).map((h) => String(h).trim());

    const isSuperAdmin = requester?.isSuperAdmin === true;

    const requiredHeaders = isSuperAdmin
      ? [...BASE_REQUIRED_HEADERS, ...SUPERADMIN_REQUIRED_HEADERS]
      : BASE_REQUIRED_HEADERS;

    const missingHeaders = requiredHeaders.filter((h) => !headerRow.includes(h));
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `Faltan columnas obligatorias: ${missingHeaders.join(', ')}`,
      );
    }

    const dataRaw: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    // Ignora filas totalmente vacías (o con solo espacios) que Excel conserva
    // por formato y que inflarían el conteo/validación.
    const data: any[] = dataRaw.filter((row) =>
      Object.values(row).some((value) => this.clean(value) !== ''),
    );

    if (data.length === 0) {
      throw new BadRequestException('El archivo Excel no contiene usuarios');
    }

    if (data.length > this.MAX_USERS_PER_FILE) {
      throw new BadRequestException(
        `El límite de carga es de ${this.MAX_USERS_PER_FILE} usuarios a la vez.`,
      );
    }

    const report: MassiveUploadReportDto = {
      total: data.length,
      processed: 0,
      created: 0,
      existing: 0,
      failed: 0,
      results: [],
    };

    const seenEmails = new Set<string>();
    const seenUsernames = new Set<string>();

    // Límite de usuarios por empresa (limits.maxUsers; 0 = ilimitado).
    const userLimits = new Map<string, number>();
    const companyUserCounts = new Map<string, number>();

    // Solo el SuperAdmin puede crear usuarios para otras empresas: se validan
    // las parejas Empresa+TenantId del archivo contra las empresas activas con
    // una sola consulta proyectada.
    let validCompanyKeys = new Set<string>();
    if (isSuperAdmin) {
      validCompanyKeys = await this.getValidCompanyKeys(data);
    }

    this.logger.log(
      `Iniciando carga masiva de ${data.length} usuarios ` +
        `(solicitante=${requester?._id}, superAdmin=${isSuperAdmin}).`,
    );

    for (const [index, row] of data.entries()) {
      const excelRow = index + 2;

      const name = this.clean(row[HEADER.name]);
      const lastName = this.clean(row[HEADER.lastName]);
      const email = this.clean(row[HEADER.email]).toLowerCase();
      const phone = this.clean(row[HEADER.phone]);
      const username = this.clean(row[HEADER.username]).toLowerCase();
      const rolesInput = this.splitList(row[HEADER.roles]);
      const permissionsInput = this.splitList(row[HEADER.permissions]);
      const modulesInput = this.splitList(row[HEADER.modules]);

      // Empresa/TenantId efectivos: el SuperAdmin los toma del archivo, el
      // resto de usuarios hereda los de su propia cuenta.
      const company = isSuperAdmin
        ? this.clean(row[HEADER.company])
        : this.clean(requester?.company);
      const tenantId = isSuperAdmin
        ? this.clean(row[HEADER.tenantId])
        : this.clean(requester?.tenantId || requester?.company);

      const displayName =
        [name, lastName].filter(Boolean).join(' ') || `Fila ${excelRow}`;

      try {
        const missingFields: string[] = [];
        if (!name) missingFields.push(HEADER.name);
        if (!lastName) missingFields.push(HEADER.lastName);
        if (!email) missingFields.push(HEADER.email);
        if (!company) missingFields.push(HEADER.company);
        if (!tenantId) missingFields.push(HEADER.tenantId);

        if (missingFields.length > 0) {
          throw new Error(
            `Campos obligatorios vacíos: ${missingFields.join(', ')}`,
          );
        }

        if (!EMAIL_REGEX.test(email)) {
          throw new Error('El correo electrónico no tiene un formato válido');
        }

        if (
          isSuperAdmin &&
          !validCompanyKeys.has(`${company}::${tenantId}`)
        ) {
          throw new Error(
            'La empresa no existe o el TenantId no corresponde a la empresa indicada',
          );
        }

        // Duplicados dentro del mismo archivo (unicidad global)
        if (seenEmails.has(email)) {
          throw new Error('Correo electrónico duplicado dentro del archivo');
        }
        if (username && seenUsernames.has(username)) {
          throw new Error('Usuario duplicado dentro del archivo');
        }

        // Correo único global (también garantizado por índice en BD)
        const existingEmail = await this.userModel
          .findOne({ email })
          .setOptions({ bypassTenant: true })
          .lean()
          .exec();

        if (existingEmail) {
          seenEmails.add(email);
          if (username) seenUsernames.add(username);
          report.existing += 1;
          report.processed += 1;
          report.results.push({
            row: excelRow,
            name: displayName,
            email,
            status: 'existing' as MassiveUserStatus,
            message: 'El usuario ya existe (correo registrado)',
          });
          continue;
        }

        // Usuario único global (solo si viene diligenciado)
        if (username) {
          const existingUsername = await this.userModel
            .findOne({ username })
            .setOptions({ bypassTenant: true })
            .lean()
            .exec();
          if (existingUsername) {
            throw new Error('El usuario ya está registrado');
          }
        }

        // Límite de usuarios de la empresa (0 = ilimitado)
        const maxUsers = await this.getUserLimit(company, tenantId, userLimits);
        if (maxUsers > 0) {
          const current = await this.getCompanyUserCount(
            company,
            companyUserCounts,
          );
          if (current >= maxUsers) {
            throw new Error(
              `Se alcanzó el máximo de usuarios de la empresa (${maxUsers})`,
            );
          }
        }

        const roles = await this.resolveRoles(rolesInput);
        const permissions = await this.resolvePermissions(permissionsInput);
        const modules = await this.resolveModules(modulesInput);

        const tempPassword = generatePassword.generate({
          length: 12,
          numbers: true,
          uppercase: true,
          symbols: true,
          strict: true,
        });

        const newUser = new this.userModel({
          name,
          lastName,
          email,
          ...(phone ? { phone } : {}),
          ...(username ? { username } : {}),
          password: tempPassword,
          company,
          tenantId,
          roles,
          permissions,
          modules,
          isActived: true,
          isAdmin: false,
          isSuperAdmin: false,
          isNewUser: true,
          mustChangePassword: true,
        });

        await newUser.save();

        companyUserCounts.set(company, (companyUserCounts.get(company) || 0) + 1);

        // Envío de correo NO bloqueante (igual que la creación individual)
        this.mailService
          .sendEmail({
            to: email,
            subject: 'Bienvenido a BpoNet - Activa tu cuenta',
            template: 'welcome',
            context: {
              name,
              platform_name: 'BpoNet',
              username: username || email,
              password: tempPassword,
              login_url: 'https://app.bponet.com.co',
            },
          })
          .catch((mailError: any) => {
            this.logger.error(
              `Error enviando correo a ${email}: ${mailError?.message}`,
              mailError?.stack,
            );
          });

        seenEmails.add(email);
        if (username) seenUsernames.add(username);

        report.created += 1;
        report.processed += 1;
        report.results.push({
          row: excelRow,
          name: displayName,
          email,
          status: 'created' as MassiveUserStatus,
          message: 'Usuario creado correctamente',
        });
      } catch (err: any) {
        this.logger.error(
          `Error procesando la fila ${excelRow}: ${err?.message}`,
          err?.stack,
        );
        report.failed += 1;
        report.processed += 1;
        report.results.push({
          row: excelRow,
          name: displayName,
          email: email || '---',
          status: 'failed' as MassiveUserStatus,
          message: err?.message || 'Error desconocido al crear el usuario',
        });
      }
    }

    this.logger.log(
      `Carga masiva finalizada: ${report.created} creados, ` +
        `${report.existing} existentes, ${report.failed} fallidos.`,
    );

    return {
      message: 'Proceso de carga masiva finalizado',
      statusCode: 200,
      status: 'Success',
      data: report,
    };
  }

  /**
   * Obtiene las parejas válidas `Empresa::TenantId` de las empresas activas
   * referenciadas en el archivo con una sola consulta proyectada.
   */
  private async getValidCompanyKeys(data: any[]): Promise<Set<string>> {
    const companyNames = [
      ...new Set(
        data.map((row) => this.clean(row[HEADER.company])).filter(Boolean),
      ),
    ];

    if (companyNames.length === 0) {
      return new Set<string>();
    }

    const companies = await this.companyModel
      .find({ name: { $in: companyNames }, isActive: true })
      .select('name id -_id')
      .lean()
      .exec();

    return new Set(companies.map((company: any) => `${company.name}::${company.id}`));
  }

  /** Límite de usuarios de la empresa (0 = ilimitado), con caché por empresa. */
  private async getUserLimit(
    company: string,
    tenantId: string,
    cache: Map<string, number>,
  ): Promise<number> {
    if (cache.has(company)) {
      return cache.get(company) as number;
    }
    const raw = await this.tenantConfigService.getPolicyValue(
      tenantId,
      company,
      'limits.maxUsers',
    );
    const limit = Number(raw) || 0;
    cache.set(company, limit);
    return limit;
  }

  /** Conteo actual de usuarios de la empresa, con caché por empresa. */
  private async getCompanyUserCount(
    company: string,
    cache: Map<string, number>,
  ): Promise<number> {
    if (cache.has(company)) {
      return cache.get(company) as number;
    }
    const count = await this.userModel
      .countDocuments({ company })
      .setOptions({ bypassTenant: true })
      .exec();
    const total = Number(count) || 0;
    cache.set(company, total);
    return total;
  }

  private clean(value: any): string {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  private splitList(value: any): string[] {
    const raw = this.clean(value);
    if (!raw) return [];
    return raw
      .split(';')
      .map((item) => item.trim())
      .filter((item) => item !== '');
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async resolveRoles(inputs: string[]): Promise<any[]> {
    const roles: any[] = [];
    for (const value of inputs) {
      const byCode = await this.rolModel
        .findOne({ codeRol: new RegExp(`^${this.escapeRegExp(value)}$`, 'i') })
        .lean()
        .exec();

      const role =
        byCode ||
        (await this.rolModel
          .findOne({
            name: new RegExp(`^${this.escapeRegExp(value)}$`, 'i'),
          })
          .lean()
          .exec());

      if (!role) {
        // Los roles inexistentes se omiten: el usuario se crea igual y el rol
        // puede asignarse manualmente después.
        this.logger.warn(`El rol "${value}" no existe; se omite.`);
        continue;
      }

      roles.push({
        name: role.name,
        codeRol: role.codeRol,
        description: role.description,
        isActive: role.isActive,
        isInheritPermissions: role.isInheritPermissions,
        permissions: role.permissions || [],
      });
    }
    return roles;
  }

  private async resolvePermissions(inputs: string[]): Promise<any[]> {
    const permissions: any[] = [];
    for (const value of inputs) {
      const regex = new RegExp(`^${this.escapeRegExp(value)}$`, 'i');
      const permission =
        (await this.permissionModel.findOne({ name: regex }).lean().exec()) ||
        (await this.permissionModel.findOne({ action: regex }).lean().exec());

      if (!permission) {
        // Los permisos inexistentes se omiten (no bloquean la creación).
        this.logger.warn(`El permiso "${value}" no existe; se omite.`);
        continue;
      }

      permissions.push({
        name: permission.name,
        description: permission.description,
        action: permission.action,
        isActive: permission.isActive,
      });
    }
    return permissions;
  }

  private async resolveModules(inputs: string[]): Promise<any[]> {
    const modules: any[] = [];
    for (const value of inputs) {
      const module = await this.moduleModel
        .findOne({ name: new RegExp(`^${this.escapeRegExp(value)}$`, 'i') })
        .lean()
        .exec();

      if (!module) {
        // Los módulos inexistentes se omiten (no bloquean la creación).
        this.logger.warn(`El módulo "${value}" no existe; se omite.`);
        continue;
      }

      modules.push({
        name: module.name,
        description: module.description,
        isActive: module.isActive,
        isSystemModule: module.isSystemModule,
        routes: (module as any).routes || (module as any).router || [],
      });
    }
    return modules;
  }
}
