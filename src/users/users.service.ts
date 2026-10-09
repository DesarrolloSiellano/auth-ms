import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserAdminService } from './user-admin.service';
import { UserLimitsService } from './user-limits.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { MailService } from 'src/mail/mail.service';
import {
  applyVerificationToken,
  sendVerificationEmail,
} from 'src/mail/helpers/email-verification.helper';
import * as generatePassword from 'generate-password';
import * as crypto from 'crypto';
import {
  resolveUserRoles,
  resolveUserPermissions,
  resolveUserModules,
} from './helpers/user-resolution.helper';
import { toPublicUser } from './helpers/user.sanitizer';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { FeaturePolicyService } from 'src/core/services/feature-policy.service';
import { tenantLocalStorage } from 'src/core/database/tenant.context';
import { DEFAULT_FRONT_URL } from 'src/core/helpers/app-url.helper';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Rol') private readonly rolModel: Model<any>,
    @InjectModel('Permission') private readonly permissionModel: Model<any>,
    @InjectModel('Module') private readonly moduleModel: Model<any>,
    private readonly mailService: MailService,
    private readonly tenantConfigService: TenantConfigService,
    private readonly userLimitsService: UserLimitsService,
    private readonly featurePolicy: FeaturePolicyService,
    private readonly configService: ConfigService,
    @Optional() private readonly userAdminService?: UserAdminService,
  ) {}

  async create(createUserDto: CreateUserDto, requester?: any) {
    const email = this.normalizeEmail(createUserDto.email);
    const username = this.normalizeUsername(createUserDto.username);

    const store = tenantLocalStorage.getStore();
    const requesterIsSuperAdmin = requester?.isSuperAdmin === true;

    // Identidad canónica de la empresa: `company = Company.name`,
    // `tenantId = Company.id` (RUT/NIT). Se deriva de `companies`.
    let company = String(createUserDto.company || '').trim();
    let tenantId = String((createUserDto as any).tenantId || '').trim();

    if (requesterIsSuperAdmin) {
      // El SuperAdmin debe elegir explícitamente la empresa destino; nunca se
      // heredan su propia empresa ni su propio tenantId.
      if (!company || !tenantId) {
        throw new BadRequestException(
          'La empresa y el tenantId son obligatorios para crear usuarios',
        );
      }
    } else if (requester) {
      // Admin/servicio: el par se fuerza desde su identidad verificada.
      company = String(requester.company || '').trim();
      tenantId = String(requester.tenantId || '').trim();
      if (!company && !tenantId) {
        throw new BadRequestException(
          'La empresa y el tenantId del solicitante son obligatorios',
        );
      }
    } else {
      // Llamadas TCP sin requester: el contexto de tenant es la fuente.
      company = company || String(store?.companyId || '').trim();
      tenantId = tenantId || String(store?.tenantId || '').trim();
    }

    if (company || tenantId) {
      const identity = await this.tenantConfigService.resolveCompanyPair(
        company,
        tenantId,
      );
      if (!identity) {
        throw new BadRequestException(
          `La empresa "${company || tenantId}" no existe, no está activa o el tenantId no corresponde`,
        );
      }
      company = identity.name;
      tenantId = identity.id;
    }

    await this.userLimitsService.assertWithinLimits({
      company,
      tenantId,
      additionalUsers: 1,
      roleDemands: this.userLimitsService.buildRoleDemands(
        this.userLimitsService.extractRoleCodes(createUserDto.roles),
      ),
    });
    await this.ensureUniqueIdentity(email, username);

    // `features.invitations = false` degrada la invitación a correo de
    // bienvenida con usuario y contraseña temporal (sin enlace).
    const requestedInvite = createUserDto.invite === true;
    const invitationsEnabled = requestedInvite
      ? await this.featurePolicy.isEnabled(
          tenantId,
          company,
          'features.invitations',
        )
      : true;
    const isInvite = requestedInvite && invitationsEnabled;

    // Generar contraseña temporal segura
    const tempPassword = generatePassword.generate({
      length: 12,
      numbers: true,
      uppercase: true,
      symbols: true,
      strict: true,
    });

    const userData: any = {
      ...createUserDto,
      // Se persiste SIEMPRE el par canónico resuelto (nunca el del solicitante
      // ni un valor crudo del payload).
      ...(company ? { company } : {}),
      ...(tenantId ? { tenantId } : {}),
      password: tempPassword,
      // Al crear (invitación o temporal) el usuario debe establecer/cambiar su
      // contraseña. `isNewUser` se mantiene en sincronía (compatibilidad).
      mustChangePassword: true,
      isNewUser: true,
    };
    delete userData.invite;

    // A2b: `permissions` y `modules` solo los asigna un SuperAdmin. Un admin de
    // empresa conserva `roles` (con topes) e `isAdmin`.
    if (requester && !requester.isSuperAdmin) {
      delete userData.permissions;
      delete userData.modules;
    }

    if (createUserDto.customFields !== undefined) {
      userData.customFields = this.userAdminService
        ? await this.userAdminService.validateCustomFields(
            company,
            tenantId,
            createUserDto.customFields,
          )
        : createUserDto.customFields;
    }

    // Período de prueba: `limits.trialDays` (override) o TEST_USER_DAYS.
    if (createUserDto.isTrial === true) {
      const days = await this.resolveTrialDays(company, tenantId);
      userData.isTrial = true;
      userData.trialStartedAt = new Date();
      userData.trialEndsAt =
        days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
    }

    let inviteToken = '';
    if (isInvite) {
      const token = this.generateResetToken();
      userData.passwordResetToken = token.hash;
      userData.passwordResetExpires = token.expires;
      userData.invitedAt = new Date();
      inviteToken = token.raw;
    }

    if (email) userData.email = email;
    if (username) userData.username = username;
    else delete userData.username;

    // Token de verificación de correo (se guarda junto con el alta).
    const verifyRaw = applyVerificationToken(userData);

    const newUser = new this.userModel(userData);
    const result = await newUser.save();

    // Envío del correo de verificación (token de un solo uso), no bloqueante.
    sendVerificationEmail(
      this.mailService,
      result,
      verifyRaw,
      this.frontUrl(userData.redirectUri),
    ).catch((error: any) => {
      this.logger.error(
        'Error sending verification email: ' + error?.message,
        error?.stack,
      );
    });

    if (isInvite) {
      const inviteUrl = `${this.frontUrl(userData.redirectUri)}/set-password?token=${inviteToken}`;
      this.mailService
        .sendEmail({
          to: result.email,
          subject: 'Invitación a BpoNet',
          template: 'invite',
          tenantId,
          company,
          context: {
            name: result.name,
            platform_name: 'BpoNet',
            invite_url: inviteUrl,
          },
        })
        .catch((error: any) => {
          this.logger.error(
            'Error sending invite email: ' + error?.message,
            error?.stack,
          );
        });
    } else {
      this.mailService
        .sendEmail({
          to: result.email,
          subject: 'Bienvenido a BpoNet - Activa tu cuenta',
          template: 'welcome',
          tenantId,
          company,
          context: {
            name: result.name,
            platform_name: 'BpoNet',
            username: result.email,
            password: tempPassword,
            login_url: this.frontUrl(userData.redirectUri),
          },
        })
        .catch((error: any) => {
          this.logger.error(
            'Error sending email: ' + error?.message,
            error?.stack,
          );
        });
    }

    return {
      data: toPublicUser(result.toObject()),
      message: 'User created successfully. Activation email sent.',
      meta: {
        totalData: 1,
        createdAt: new Date().toISOString(),
        id: result._id,
      },
    };
  }

  async createExternal(payload: any) {
    // Generar contraseña temporal segura
    const tempPassword = generatePassword.generate({
      length: 12,
      numbers: true,
      uppercase: true,
      symbols: true,
      strict: true,
    });

    const userRoles = await resolveUserRoles(payload, this.rolModel);
    const userPermissions = await resolveUserPermissions(payload, this.permissionModel);
    const userModules = await resolveUserModules(payload, this.moduleModel);

    // Apps externas: la empresa/tenant es obligatoria y los topes del tenant
    // se validan de forma centralizada (fail-closed).
    const companyInput = payload.company;
    if (!companyInput) {
      throw new BadRequestException(
        'La empresa (company) es obligatoria para crear usuarios',
      );
    }
    const identity =
      await this.tenantConfigService.resolveCompanyIdentity(companyInput);
    if (!identity) {
      throw new BadRequestException(
        `La empresa "${companyInput}" no existe o no está activa`,
      );
    }
    const company = identity.name;
    const tenantId = identity.id;
    if (payload.tenantId && String(payload.tenantId) !== identity.id) {
      throw new BadRequestException(
        'El tenantId no corresponde a la empresa indicada',
      );
    }
    await this.userLimitsService.assertWithinLimits({
      company,
      tenantId,
      additionalUsers: 1,
      roleDemands: this.userLimitsService.buildRoleDemands(
        userRoles.map((role: any) => role.codeRol),
      ),
    });
    for (const role of userRoles) {
      await this.tenantConfigService.ensureRoleLimitPolicy(
        role.codeRol,
        role.name,
      );
    }

    // `isNewUser` se mantiene en sincronía con `mustChangePassword` para las
    // apps externas que aún leen `isNewUser`.
    const isNewUser =
      payload.isNewUser !== undefined ? payload.isNewUser : true;

    // `_id` opcional (apps externas): si viene, debe ser un ObjectId válido.
    if (payload._id !== undefined && !Types.ObjectId.isValid(payload._id)) {
      throw new BadRequestException('El _id enviado no es válido');
    }

    const userData = {
      _id: payload._id,
      tenantId,
      name: payload.name,
      lastName: payload.lastName,
      email: this.normalizeEmail(payload.email),
      phone: payload.phone,
      username: this.normalizeUsername(payload.username || payload.email),
      password: tempPassword,
      company,
      redirectUri: payload.redirectUri || null,
      roles: userRoles,
      permissions: userPermissions,
      modules: userModules,
      isActived: payload.isActived !== undefined ? payload.isActived : true,
      isAdmin: payload.isAdmin !== undefined ? payload.isAdmin : false,
      isSuperAdmin:
        payload.isSuperAdmin !== undefined ? payload.isSuperAdmin : false,
      isNewUser,
      mustChangePassword:
        payload.mustChangePassword !== undefined
          ? payload.mustChangePassword
          : isNewUser,
    };

    const verifyRaw = applyVerificationToken(userData);

    const newUser = new this.userModel(userData);
    const result = await newUser.save();

    // Verificación de correo (token de un solo uso), no bloqueante.
    sendVerificationEmail(
      this.mailService,
      result,
      verifyRaw,
      this.frontUrl(payload.redirectUri),
    ).catch((error: any) => {
      this.logger.error(
        'Error sending verification email: ' + error?.message,
        error?.stack,
      );
    });

    this.mailService
      .sendEmail({
        to: result.email,
        subject: 'Bienvenido a BpoNet - Activa tu cuenta',
        template: 'welcome',
        tenantId: userData.tenantId,
        company: userData.company,
        context: {
          name: result.name,
          platform_name: 'BpoNet',
          username: result.email,
          password: tempPassword,
          login_url: this.frontUrl(payload.redirectUri),
        },
      })
      .catch((error: any) => {
        this.logger.error('Error sending email: ' + error?.message, error?.stack);
      });

    return {
      statusCode: 201,
      status: 'Success',
      message: 'User created successfully. Activation email sent.',
      data: toPublicUser(result.toObject()),
      meta: {
        totalData: 1,
        createdAt: new Date().toISOString(),
        id: result._id,
      },
    };
  }

  async findAll(user?: any) {
    const query: any = { deletedAt: null };
    if (user && !user.isSuperAdmin) {
      if (user.company) query.company = user.company;
      if (user.tenantId) query.tenantId = user.tenantId;
    }

    const users = await this.userModel.find(query).lean().exec();
    if (!users || users.length === 0) {
      throw new NotFoundException('No users found');
    }
    return users.map((u: any) => toPublicUser(u));
  }

  async findActiveByTenant(user?: any, onlyAgents?: unknown) {
    const query: any = { isActived: true, deletedAt: null };

    if (user && !user.isSuperAdmin) {
      const tenantId = user.tenantId || user.company;
      const company = user.company || user.tenantId;
      // Discriminación estricta por empresa: (tenantId, company).
      if (company) query.company = company;
      if (tenantId) query.tenantId = tenantId;
    }

    const users = await this.userModel.find(query).lean().exec();
    const list = users || [];

    const isOnlyAgents =
      onlyAgents === true ||
      onlyAgents === 'true' ||
      String(onlyAgents).toLowerCase() === 'true';

    let filtered = list;
    if (isOnlyAgents) {
      filtered = list.filter((u: any) =>
        u.roles?.some((r: any) => r?.codeRol === 'AGE' || r === 'AGE'),
      );
    }

    return {
      message: 'Active users retrieved by tenant successfully',
      statusCode: 200,
      status: 'Success',
      data: filtered.map((u: any) => toPublicUser(u)),
      meta: { totalData: filtered.length },
    };
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private parseFilters(filters?: any): Record<string, any> {
    if (!filters) return {};
    if (typeof filters === 'string') {
      try {
        const parsed = JSON.parse(filters);
        return parsed && typeof parsed === 'object' ? parsed : {};
      } catch {
        return {};
      }
    }
    return typeof filters === 'object' ? filters : {};
  }

  /**
   * Listado paginado. Acepta búsqueda global y filtros avanzados combinados
   * (estado, rol, bloqueo, email, usuario, teléfono, etiquetas, grupos,
   * rango de fechas y empresa) reutilizados por la búsqueda avanzada.
   */
  async findByPage(
    user?: any,
    from?: number,
    limit?: number,
    global?: any,
    filters?: any,
  ) {
    const { isSuperAdmin } = user;
    const f = this.parseFilters(filters);
    const query: any = { deletedAt: null };
    const and: any[] = [];

    if (!isSuperAdmin) {
      if (user.company) query.company = user.company;
      if (user.tenantId) query.tenantId = user.tenantId;
    } else if (f.company) {
      query.company = new RegExp(this.escapeRegExp(String(f.company)), 'i');
    }

    if (f.estado !== undefined && f.estado !== '' && f.estado !== null) {
      query.isActived = String(f.estado) === 'true';
    }
    if (String(f.isBlocked).toLowerCase() === 'true') {
      query.isBlocked = true;
    } else if (String(f.isBlocked).toLowerCase() === 'false') {
      query.isBlocked = false;
    }
    if (f.rol) {
      const rx = new RegExp(this.escapeRegExp(String(f.rol)), 'i');
      and.push({ $or: [{ 'roles.codeRol': rx }, { 'roles.name': rx }] });
    }
    if (f.email) {
      query.email = new RegExp(this.escapeRegExp(String(f.email)), 'i');
    }
    if (f.username) {
      query.username = new RegExp(this.escapeRegExp(String(f.username)), 'i');
    }
    if (f.phone) {
      query.phone = new RegExp(this.escapeRegExp(String(f.phone)), 'i');
    }
    if (f.tags) {
      const tagsEnabled = await this.featurePolicy.isEnabled(
        user?.tenantId,
        user?.company,
        'features.userTags',
      );
      if (tagsEnabled) {
        const list = String(f.tags)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (list.length) query.tags = { $in: list };
      }
    }
    if (f.groups) {
      const groupsEnabled = await this.featurePolicy.isEnabled(
        user?.tenantId,
        user?.company,
        'features.userGroups',
      );
      if (groupsEnabled) {
        const list = String(f.groups)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        if (list.length) query.groups = { $in: list };
      }
    }
    if (f.desde || f.hasta) {
      const range: any = {};
      if (f.desde) range.$gte = new Date(f.desde);
      if (f.hasta) range.$lte = new Date(`${f.hasta}T23:59:59.999Z`);
      query.created = range;
    }

    const search = f.global || global;
    if (search) {
      const regex = new RegExp(this.escapeRegExp(String(search)), 'i');
      and.push({
        $or: [
          { name: regex },
          { lastName: regex },
          { username: regex },
          { email: regex },
          { phone: regex },
          ...(isSuperAdmin ? [{ company: regex }] : []),
        ],
      });
    }

    if (and.length) query.$and = and;

    const skipNumber = from && from >= 0 ? from : 0;
    const limitNumber = limit && limit > 0 ? limit : 100;

    const [docs, totalData] = await Promise.all([
      this.userModel
        .find(query)
        .skip(skipNumber)
        .limit(limitNumber)
        .lean()
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      data: docs.map((u: any) => toPublicUser(u)),
      meta: {
        totalData: totalData,
      },
    };
  }

  // Paginación simple: ?page=1&limit=10 (puedes mejorarla con DTO o query params en el controller)
  async findByPagination(user?: any, page = 1, limit = 10) {
    const query: any = { deletedAt: null };
    if (user && !user.isSuperAdmin) {
      if (user.company) query.company = user.company;
      if (user.tenantId) query.tenantId = user.tenantId;
    }

    const skip = (page - 1) * limit;
    const [users, totalData] = await Promise.all([
      this.userModel.find(query).skip(skip).limit(limit).lean().exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    return {
      data: users.map((u: any) => toPublicUser(u)),
      meta: {
        totalData,
        page,
        limit,
      },
    };
  }

  // Búsqueda simple por ID (respetando el filtro de tenant del plugin)
  async findOne(id: string) {
    const user = await this.userModel
      .findOne({ _id: id })
      .lean()
      .exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return toPublicUser(user);
  }

  // Si quieres filtrar por fecha de creación, ajusta el DTO y lógica aquí
  async findByDate(user?: any, startDate?: string, endDate?: string) {
    // Validación simple de fechas
    if (!startDate || !endDate) {
      throw new NotFoundException(
        'You must provide both startDate and endDate',
      );
    }

    // Convierte las fechas a objetos Date
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Ajusta si quieres incluir el final completo del día (opcional)
    end.setHours(23, 59, 59, 999);

    // Busca por rango de fechas en createdAt
    const query: any = {
      deletedAt: null,
      createdAt: {
        $gte: start,
        $lte: end,
      },
    };

    if (user && !user.isSuperAdmin) {
      if (user.company) query.company = user.company;
      if (user.tenantId) query.tenantId = user.tenantId;
    }

    const users = await this.userModel.find(query).lean().exec();

    if (!users || users.length === 0) {
      throw new NotFoundException('No users found for given date range');
    }

    return {
      message: 'Users retrieved by date range successfully',
      data: users.map((u: any) => toPublicUser(u)),
      meta: {
        totalData: users.length,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      },
    };
  }

  async update(id: string, updateUserDto: UpdateUserDto, requester?: any) {
    // Aislamiento por empresa + no escalar privilegios.
    if (requester && !requester.isSuperAdmin) {
      const target: any = await this.userModel
        .findOne({ _id: id })
        .select('isSuperAdmin')
        .lean()
        .exec();
      if (target?.isSuperAdmin) {
        throw new ForbiddenException('No puedes modificar a un SuperAdmin');
      }
    }

    const hasEmail = updateUserDto.email !== undefined;
    const hasUsername = updateUserDto.username !== undefined;
    const email = hasEmail ? this.normalizeEmail(updateUserDto.email) : undefined;
    const username = hasUsername
      ? this.normalizeUsername(updateUserDto.username)
      : undefined;

    await this.ensureUniqueIdentity(
      email || undefined,
      username || undefined,
      id,
    );

    // Valida el alta neta de roles contra los topes del tenant.
    if (updateUserDto.roles !== undefined) {
      const existing: any = await this.userModel
        .findById(id)
        .select('company tenantId roles')
        .lean()
        .exec();
      const oldCodes = new Set(
        this.userLimitsService
          .extractRoleCodes(existing?.roles)
          .map((code) => code.toUpperCase()),
      );
      const added = this.userLimitsService
        .extractRoleCodes(updateUserDto.roles)
        .filter((code) => !oldCodes.has(code.toUpperCase()));

      if (added.length > 0) {
        await this.userLimitsService.assertWithinLimits({
          company: existing?.company,
          tenantId: existing?.tenantId,
          additionalUsers: 0,
          roleDemands: this.userLimitsService.buildRoleDemands(added),
        });
        for (const code of added) {
          await this.tenantConfigService.ensureRoleLimitPolicy(code);
        }
      }
    }

    const requesterIsSuper = requester?.isSuperAdmin === true;
    const requesterIsAdminOrSuper =
      requesterIsSuper || requester?.isAdmin === true;

    const setFields: any = { ...updateUserDto };
    // Defensa en profundidad: campos nunca editables por esta vía.
    for (const field of [
      'company',
      'tenantId',
      'password',
      'passwordResetToken',
      'passwordResetExpires',
      '_id',
      'created',
      'modified',
      'idUserModified',
      'createdDate',
      'createdHour',
      'updatedDate',
      'updatedAtHour',
    ]) {
      delete setFields[field];
    }
    // A2b: `permissions`/`modules` e `isSuperAdmin` solo SuperAdmin;
    // `isAdmin` admin/SuperAdmin (no usuarios de servicio anónimos).
    if (!requesterIsSuper) {
      delete setFields.permissions;
      delete setFields.modules;
      delete setFields.isSuperAdmin;
    }
    if (!requesterIsAdminOrSuper) {
      delete setFields.isAdmin;
    }
    delete setFields.email;
    delete setFields.username;
    if (hasEmail && email) setFields.email = email;

    // Mantiene `mustChangePassword` en sincronía con `isNewUser`.
    if (updateUserDto.isNewUser !== undefined) {
      setFields.mustChangePassword = updateUserDto.isNewUser === true;
    }

    if (updateUserDto.customFields !== undefined) {
      const existing = await this.userModel
        .findById(id)
        .select('company tenantId')
        .lean()
        .exec();
      const company = existing?.company;
      setFields.customFields = this.userAdminService
        ? await this.userAdminService.validateCustomFields(
            company,
            existing?.tenantId,
            updateUserDto.customFields,
          )
        : updateUserDto.customFields;
    }

    // Prueba: al marcar se inicia el período; al desmarcar se limpia.
    if (updateUserDto.isTrial !== undefined) {
      const existing: any = await this.userModel
        .findById(id)
        .select('company tenantId isTrial')
        .lean()
        .exec();
      const wantsTrial = updateUserDto.isTrial === true;
      if (wantsTrial && existing?.isTrial !== true) {
        const company = existing?.company;
        const tenant = existing?.tenantId;
        const days = await this.resolveTrialDays(company, tenant);
        setFields.isTrial = true;
        setFields.trialStartedAt = new Date();
        setFields.trialEndsAt =
          days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
      } else if (!wantsTrial) {
        setFields.isTrial = false;
        setFields.trialStartedAt = null;
        setFields.trialEndsAt = null;
      }
    }

    const updateOperation: any = { $set: setFields };
    if (hasUsername) {
      if (username) {
        updateOperation.$set.username = username;
      } else {
        updateOperation.$unset = { username: '' };
      }
    }

    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, updateOperation, { new: true })
      .lean()
      .exec();

    if (!updatedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return toPublicUser(updatedUser);
  }

  async checkAvailability(params: {
    email?: string;
    username?: string;
    excludeId?: string;
  }) {
    const email = params.email ? this.normalizeEmail(params.email) : undefined;
    const username = params.username
      ? this.normalizeUsername(params.username)
      : undefined;
    const base: any = params.excludeId ? { _id: { $ne: params.excludeId } } : {};

    const [emailDoc, usernameDoc] = await Promise.all([
      email
        ? this.userModel
            .findOne({ ...base, email })
            .setOptions({ bypassTenant: true })
            .lean()
            .exec()
        : Promise.resolve(null),
      username
        ? this.userModel
            .findOne({ ...base, username })
            .setOptions({ bypassTenant: true })
            .lean()
            .exec()
        : Promise.resolve(null),
    ]);

    return {
      message: 'User availability checked successfully',
      data: {
        emailExists: !!emailDoc,
        usernameExists: !!usernameDoc,
      },
      meta: { totalData: 1 },
    };
  }

  private normalizeEmail(email?: string): string {
    return (email ?? '').trim().toLowerCase();
  }

  private normalizeUsername(username?: string): string {
    return (username ?? '').trim().toLowerCase();
  }

  private generateResetToken(): { raw: string; hash: string; expires: Date } {
    const raw = crypto.randomBytes(32).toString('hex');
    return {
      raw,
      hash: crypto.createHash('sha256').update(raw).digest('hex'),
      expires: new Date(Date.now() + 48 * 60 * 60 * 1000),
    };
  }

  private frontUrl(redirectUri?: string): string {
    if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
      return DEFAULT_FRONT_URL;
    }
    return redirectUri;
  }

  /**
   * Días de prueba: `limits.trialDays` (>0) sobrescribe; si no, TEST_USER_DAYS.
   * 0 = sin expiración.
   */
  private async resolveTrialDays(
    company?: string,
    tenantId?: string,
  ): Promise<number> {
    const policy = Number(
      await this.tenantConfigService.getPolicyValue(
        tenantId,
        company,
        'limits.trialDays',
      ),
    );
    if (Number.isFinite(policy) && policy > 0) return policy;

    const env = Number(this.configService.get<string>('TEST_USER_DAYS', '7'));
    return Number.isFinite(env) && env > 0 ? env : 0;
  }

  private async ensureUniqueIdentity(
    email?: string,
    username?: string,
    excludeId?: string,
  ): Promise<void> {
    const base: any = excludeId ? { _id: { $ne: excludeId } } : {};

    if (email) {
      const existingEmail = await this.userModel
        .findOne({ ...base, email })
        .setOptions({ bypassTenant: true })
        .lean()
        .exec();
      if (existingEmail) {
        throw new ConflictException('El correo electrónico ya está registrado');
      }
    }

    if (username) {
      const existingUsername = await this.userModel
        .findOne({ ...base, username })
        .setOptions({ bypassTenant: true })
        .lean()
        .exec();
      if (existingUsername) {
        throw new ConflictException('El nombre de usuario ya está registrado');
      }
    }
  }

  async remove(id: string) {
    const deletedUser = await this.userModel.findByIdAndDelete(id).lean().exec();
    if (!deletedUser) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return toPublicUser(deletedUser);
  }

  async getProfile(user: any) {
    const found = await this.userModel.findById(user._id).lean().exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }

    const tenantConfig = await this.resolveTenantConfig(found);

    return {
      message: 'Profile retrieved successfully',
      data: {
        user: toPublicUser(found),
        modules: found.modules || [],
        roles: found.roles || [],
        permissions: found.permissions || [],
        ...(tenantConfig ? { tenantConfig } : {}),
      },
      meta: {
        totalData: 1,
        id: found._id,
      },
    };
  }

  private async resolveTenantConfig(user: any): Promise<any> {
    if (!this.tenantConfigService.isEmbedEnabled()) return null;
    try {
      const resolved = await this.tenantConfigService.resolveConfig(
        user?.tenantId,
        user?.company,
      );
      return resolved?.data ?? null;
    } catch (error: any) {
      this.logger.warn(
        `No se pudo resolver tenantConfig en profile: ${error?.message}`,
      );
      return null;
    }
  }

  async getUserModules(user: any) {
    const found = await this.userModel
      .findById(user._id)
      .select('modules')
      .lean()
      .exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Modules retrieved successfully',
      data: found.modules || [],
      meta: {
        totalData: (found.modules || []).length,
        id: found._id,
      },
    };
  }

  async getUserRoles(user: any) {
    const found = await this.userModel
      .findById(user._id)
      .select('roles')
      .lean()
      .exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Roles retrieved successfully',
      data: found.roles || [],
      meta: {
        totalData: (found.roles || []).length,
        id: found._id,
      },
    };
  }

  async getUserPermissions(user: any) {
    const found = await this.userModel
      .findById(user._id)
      .select('permissions')
      .lean()
      .exec();
    if (!found) {
      throw new NotFoundException('User not found');
    }
    return {
      message: 'Permissions retrieved successfully',
      data: found.permissions || [],
      meta: {
        totalData: (found.permissions || []).length,
        id: found._id,
      },
    };
  }
}
