import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditService, AuditEntry } from 'src/audit/audit.service';
import { Login, ChangePassword, RecoveryPassword } from './dto/auth.dto';
import { EncryptionService } from 'src/core/services/encryption.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from 'src/users/entities/user.entity';
import { Company } from 'src/companies/entities/company.entity';
import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import {
  applyVerificationToken,
  sendVerificationEmail,
} from 'src/mail/helpers/email-verification.helper';
import { SessionsService } from 'src/sessions/sessions.service';
import * as crypto from 'crypto';
import { SetPasswordWithToken } from './dto/auth.dto';
import { buildIdentityPayload } from './helpers/identity-payload.helper';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';
import { LocaleService, DEFAULT_TIMEZONE, DEFAULT_LOCALE } from 'src/core/services/locale.service';
import { DEFAULT_FRONT_URL } from 'src/core/helpers/app-url.helper';

export interface LoginRestriction {
  code: string;
  message: string;
  details?: Record<string, any>;
}

/**
 * Hash bcrypt de relleno para igualar el tiempo de respuesta cuando el usuario
 * no existe (anti-enumeración por timing). No corresponde a ninguna contraseña.
 */
const DUMMY_PASSWORD_HASH =
  '$2b$10$wFm7GBoDeIxwM5BvcTw9g.g/CoUQ8QyELqYfxLCq1ZcNnMq61hz1m';

const INVALID_CREDENTIALS = {
  message: 'Credenciales inválidas',
  code: 'INVALID_CREDENTIALS',
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Company') private readonly companyModel: Model<Company>,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly tenantConfigService: TenantConfigService,
    private readonly localeService: LocaleService,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  private audit(entry: AuditEntry): void {
    this.auditService?.logAsync(entry);
  }

  async login(login: Login, ip: string = '') {
    const { meta } = login;
    const identifier = (login.email ?? '').trim().toLowerCase();
    const userDB = await this.userModel
      .findOne({
        $or: [{ email: identifier }, { username: identifier }],
      })
      .lean()
      .exec();

    if (!userDB) {
      this.audit({
        action: 'login.failed',
        category: 'auth',
        status: 'failed',
        email: identifier,
        ip,
        userAgent: meta?.user_agent,
        browser: meta?.browser,
        os: meta?.os,
        detail: { reason: 'user_not_found' },
      });
      // Anti-enumeración: mismo mensaje que "contraseña inválida" e igualar el
      // tiempo de respuesta con un compare de relleno.
      await Promise.resolve(
        this.encryptionService.verifyPassword(login.password, DUMMY_PASSWORD_HASH),
      ).catch(() => false);
      throw new ForbiddenException(INVALID_CREDENTIALS);
    }

    const restrictions = await this.resolveLoginRestriction(userDB);
    if (restrictions.length > 0) {
      this.audit({
        action: 'login.failed',
        category: 'auth',
        status: 'failed',
        userId: String(userDB._id as any),
        email: userDB.email,
        company: userDB.company,
        tenantId: userDB.tenantId,
        ip,
        userAgent: meta?.user_agent,
        browser: meta?.browser,
        os: meta?.os,
        detail: {
          reason: restrictions[0].code,
          codes: restrictions.map((restriction) => restriction.code),
        },
      });
      throw new ForbiddenException({
        message: restrictions[0].message,
        code: restrictions[0].code,
        errors: restrictions,
      });
    }

    const isPasswordValid = await this.encryptionService.verifyPassword(
      login.password,
      userDB.password,
    );

    if (!isPasswordValid) {
      const lock = await this.registerFailedAttempt(userDB);
      this.audit({
        action: 'login.failed',
        category: 'auth',
        status: 'failed',
        userId: String(userDB._id as any),
        email: userDB.email,
        company: userDB.company,
        tenantId: userDB.tenantId,
        ip,
        userAgent: meta?.user_agent,
        browser: meta?.browser,
        os: meta?.os,
        detail: {
          reason: lock.blocked ? 'blocked_threshold' : 'invalid_password',
        },
      });
      if (lock.blocked) {
        const message = lock.indefinite
          ? 'Usuario bloqueado. Contacte al administrador.'
          : `Usuario bloqueado temporalmente. Intente nuevamente en ${lock.minutes} minuto(s).`;
        const code = lock.indefinite
          ? 'USER_BLOCKED_INDEFINITE'
          : 'USER_BLOCKED_TEMPORARY';
        throw new ForbiddenException({
          message,
          code,
          errors: [
            {
              code,
              message,
              details: { reason: 'auto', minutes: lock.minutes },
            },
          ],
        });
      }
      throw new ForbiddenException(INVALID_CREDENTIALS);
    }

    if (userDB.isBlocked || userDB.failedLoginAttempts) {
      void this.userModel
        .updateOne(
          { _id: userDB._id },
          {
            $set: {
              isBlocked: false,
              blockedUntil: null,
              blockReason: null,
              failedLoginAttempts: 0,
            },
          },
        )
        .setOptions({ bypassTenant: true })
        .exec();
    }

    const sessionId = new Types.ObjectId();
    const payload = buildIdentityPayload(userDB, String(sessionId));

    const accessToken = this.getJwtToken(
      payload,
      this.configService.get<string>('JWT_SECRET'),
      this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
    );

    const refreshToken = this.getJwtToken(
      { _id: userDB._id, sid: String(sessionId) },
      this.configService.get<string>('JWT_REFRESH_SECRET'),
      this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
    );

    const session = {
      _id: sessionId,
      user: (userDB._id as any).toString(),
      idUser: (userDB._id as any).toString(),
      email: userDB.email,
      company: userDB.company,
      tenantId: userDB.tenantId || userDB.company || '0000000',
      isSuperAdmin: userDB.isSuperAdmin === true,
      ip: ip,
      user_agent: meta?.user_agent || '',
      os: meta?.os || '',
      os_version: meta?.os_version || '',
      browser: meta?.browser || '',
      browser_version: meta?.browser_version || '',
      istable: meta?.istable || false,
      ismovil: meta?.ismovil || false,
      isbrowser: meta?.isbrowser || false,
      refreshToken: this.hashToken(refreshToken), // Store hashed refresh token
      lastActivityAt: new Date(),
    };

    await this.sessionsService.createSession(session as any);

    this.audit({
      action: 'login.success',
      category: 'auth',
      status: 'success',
      userId: String(userDB._id as any),
      email: userDB.email,
      company: userDB.company,
      tenantId: userDB.tenantId,
      ip,
      userAgent: meta?.user_agent,
      browser: meta?.browser,
      os: meta?.os,
      device: [meta?.browser, meta?.os].filter(Boolean).join(' · '),
      detail: { sessionId: String(sessionId) },
    });

    void this.notifyNewLogin(userDB, meta, ip);

    const tenantConfig = await this.resolveTenantConfig(userDB);

    return {
      message: 'Login successful',
      meta: {
        payload,
        token: accessToken, // Alias para compatibilidad con el front viejo
        accessToken,
        refreshToken,
        mustChangePassword: userDB.mustChangePassword === true,
        ...(tenantConfig ? { tenantConfig } : {}),
        totalData: 1,
      },
    };
  }

  /**
   * Devuelve si el usuario está bloqueado. Si el bloqueo expiró, lo limpia.
   * No lanza: el llamador decide.
   */
  private async checkBlock(
    user: any,
  ): Promise<{ blocked: boolean; until?: string; indefinite: boolean }> {
    if (!user?.isBlocked) return { blocked: false, indefinite: false };

    // Sin fecha de expiración = bloqueo permanente/indefinido (manual o por
    // `security.lockMinutes = 0`): no se levanta solo.
    if (!user.blockedUntil) {
      return { blocked: true, indefinite: true };
    }

    const until = new Date(user.blockedUntil);
    if (until.getTime() <= Date.now()) {
      await this.userModel
        .updateOne(
          { _id: user._id },
          {
            $set: {
              isBlocked: false,
              blockedUntil: null,
              blockReason: null,
              failedLoginAttempts: 0,
            },
          },
        )
        .setOptions({ bypassTenant: true })
        .exec();
      return { blocked: false, indefinite: false };
    }
    return { blocked: true, indefinite: false, until: until.toISOString() };
  }

  /**
   * Bloqueo por empresa: sin `blockedUntil` es indefinido; con fecha, se
   * levanta al vencer. Devuelve `null` si no aplica.
   */
  private async checkCompanyBlock(
    user: any,
    timezone = DEFAULT_TIMEZONE,
  ): Promise<{
    blocked: boolean;
    indefinite: boolean;
    until?: string;
    untilLabel?: string;
    reason?: string;
  } | null> {
    if (!user) return null;
    const or: any[] = [];
    if (user.tenantId) or.push({ id: user.tenantId });
    if (user.company) or.push({ name: user.company });
    if (or.length === 0) return null;

    const company: any = await this.companyModel
      .findOne({ $or: or })
      .lean()
      .exec();
    if (!company || !company.isBlocked) return null;

    if (
      company.blockedUntil &&
      new Date(company.blockedUntil).getTime() <= Date.now()
    ) {
      await this.companyModel
        .updateOne(
          { _id: company._id },
          { $set: { isBlocked: false, blockReason: null, blockedUntil: null } },
        )
        .exec();
      return null;
    }

    const until = company.blockedUntil ? new Date(company.blockedUntil) : null;
    return {
      blocked: true,
      indefinite: !until,
      until: until ? until.toISOString() : undefined,
      untilLabel: until
        ? this.localeService.formatDateTime(until, timezone, DEFAULT_LOCALE)
        : '',
      reason: company.blockReason,
    };
  }

  /**
   * Reúne TODOS los motivos por los que el usuario no puede iniciar sesión,
   * en orden de precedencia: empresa → usuario → prueba → inactivo.
   */
  private async resolveLoginRestriction(
    user: any,
  ): Promise<LoginRestriction[]> {
    const restrictions: LoginRestriction[] = [];
    const { timezone, locale } = await this.localeContext(user);

    // 1) Empresa bloqueada (temporal o indefinida).
    const companyBlock = await this.checkCompanyBlock(user, timezone);
    if (companyBlock?.blocked) {
      restrictions.push({
        code: 'COMPANY_BLOCKED',
        message: companyBlock.indefinite
          ? 'Tu empresa está bloqueada. Contacta al administrador.'
          : `Tu empresa está bloqueada temporalmente hasta el ${companyBlock.untilLabel}.`,
        details: {
          blockType: companyBlock.indefinite ? 'indefinite' : 'temporary',
          until: companyBlock.until,
          reason: companyBlock.reason,
        },
      });
    }

    // 2) Bloqueo del usuario (automático por intentos o manual).
    const block = await this.checkBlock(user);
    if (block.blocked) {
      if (block.indefinite) {
        restrictions.push({
          code: 'USER_BLOCKED_INDEFINITE',
          message: 'Usuario bloqueado. Contacte al administrador.',
          details: { reason: user?.blockReason || 'manual', indefinite: true },
        });
      } else {
        const until = block.until ? new Date(block.until) : null;
        const minutes = until
          ? Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60000))
          : 0;
        const isAuto =
          String(user?.blockReason || '').toLowerCase() === 'auto';
        restrictions.push({
          code: 'USER_BLOCKED_TEMPORARY',
          message: isAuto
            ? `Usuario bloqueado temporalmente. Intente nuevamente en ${minutes} minuto(s).`
            : `Usuario bloqueado temporalmente hasta el ${
                until
                  ? this.localeService.formatDateTime(until, timezone, locale)
                  : ''
              }.`,
          details: {
            reason: isAuto ? 'auto' : 'manual',
            until: block.until,
            minutes,
          },
        });
      }
    }

    // 3) Período de prueba vencido.
    if (user?.isTrial && user?.trialEndsAt) {
      const ends = new Date(user.trialEndsAt);
      if (!Number.isNaN(ends.getTime()) && ends.getTime() <= Date.now()) {
        restrictions.push({
          code: 'TRIAL_EXPIRED',
          message: `Tu período de prueba finalizó el ${this.localeService.formatDate(
            ends,
            timezone,
          )}. Contacta al administrador.`,
          details: { trialEndsAt: ends.toISOString() },
        });
      }
    }

    // 4) Usuario inactivo.
    if (user && user.isActived === false) {
      restrictions.push({
        code: 'USER_INACTIVE',
        message: 'Usuario no activo, comuníquese con el administrador.',
      });
    }

    return restrictions;
  }

  /**
   * Incrementa el contador de intentos fallidos y aplica bloqueo temporal
   * cuando se alcanza `security.maxFailedAttempts` del tenant.
   */
  private async registerFailedAttempt(user: any): Promise<{
    blocked: boolean;
    indefinite: boolean;
    minutes: number;
    until?: Date;
  }> {
    const attempts = Number(user?.failedLoginAttempts || 0) + 1;

    const rawMax = await this.tenantConfigService.getPolicyValue(
      user?.tenantId,
      user?.company,
      'security.maxFailedAttempts',
    );
    const max = rawMax === null || rawMax === undefined ? NaN : Number(rawMax);

    const rawMinutes = await this.tenantConfigService.getPolicyValue(
      user?.tenantId,
      user?.company,
      'security.lockMinutes',
    );
    const minutesValue =
      rawMinutes === null || rawMinutes === undefined
        ? NaN
        : Number(rawMinutes);

    const update: any = {
      failedLoginAttempts: attempts,
      lastFailedLoginAt: new Date(),
    };

    // `maxFailedAttempts` <= 0 = intentos ilimitados: no bloquea.
    // Se bloquea al EXCEDER el máximo permitido.
    const exceeds =
      Number.isFinite(max) && max > 0 && attempts > max;

    if (!exceeds) {
      await this.userModel
        .updateOne({ _id: user._id }, { $set: update })
        .setOptions({ bypassTenant: true })
        .exec();
      return { blocked: false, indefinite: false, minutes: 0 };
    }

    // `lockMinutes`: > 0 bloqueo temporal; 0 = indefinido; ausente/ inválido = 15.
    let indefinite = false;
    let minutes = 15;
    if (Number.isFinite(minutesValue)) {
      if (minutesValue <= 0) {
        indefinite = true;
        minutes = 0;
      } else {
        minutes = minutesValue;
      }
    }

    update.isBlocked = true;
    update.blockReason = 'auto';
    update.failedLoginAttempts = 0;
    update.blockedUntil = indefinite
      ? null
      : new Date(Date.now() + minutes * 60 * 1000);

    this.audit({
      action: 'security.auto_lock',
      category: 'security',
      status: 'failed',
      userId: String(user._id),
      email: user.email,
      company: user.company,
      tenantId: user.tenantId,
      detail: { attempts, max, minutes, indefinite },
    });

    await this.userModel
      .updateOne({ _id: user._id }, { $set: update })
      .setOptions({ bypassTenant: true })
      .exec();

    return {
      blocked: true,
      indefinite,
      minutes,
      until: update.blockedUntil || undefined,
    };
  }

  /**
   * Resuelve la configuración del tenant para embeberla en login/perfil.
   * Controlado por `TENANT_CONFIG_EMBED_IN_AUTH`. Fail-open: si falla, no
   * rompe el login.
   */
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
        `No se pudo resolver tenantConfig para login: ${error?.message}`,
      );
      return null;
    }
  }

  /** Resuelve zona horaria y locale de visualización del tenant. */
  private async localeContext(user: any): Promise<{
    timezone: string;
    locale: string;
  }> {
    try {
      const [timezone, locale] = await Promise.all([
        this.localeService.getTimezone(user?.tenantId, user?.company),
        this.localeService.getLocale(user?.tenantId, user?.company),
      ]);
      return { timezone, locale };
    } catch {
      return { timezone: DEFAULT_TIMEZONE, locale: DEFAULT_LOCALE };
    }
  }

  /**
   * Notifica al usuario un nuevo inicio de sesión. No bloqueante y respeta
   * `preferences.notifications` / `preferences.notifications.newLogin` y
   * `channels.email.enabled` del tenant.
   */
  private async notifyNewLogin(
    user: any,
    meta: any,
    ip: string,
  ): Promise<void> {
    try {
      if (!(await this.isLoginNotificationEnabled(user))) return;
      const { timezone } = await this.localeContext(user);
      const now = new Date();
      await this.mailService.sendEmail({
        to: user.email,
        subject: 'Nuevo inicio de sesión - BpoNet',
        template: 'session',
        tenantId: user.tenantId,
        company: user.company,
        context: {
          name: user.name,
          platform_name: 'BpoNet',
          os: meta?.os || 'Desconocido',
          browser: meta?.browser || 'Desconocido',
          user_agent: meta?.user_agent || '',
          ip: ip || 'Desconocida',
          fecha: this.localeService.formatDate(now, timezone),
          hora: this.localeService.formatTime(now, timezone),
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `No se pudo enviar la notificación de nuevo login: ${error?.message}`,
      );
    }
  }

  private async isLoginNotificationEnabled(user: any): Promise<boolean> {
    try {
      // Precedencia: notificaciones (feature) → preferencias globales →
      // aviso de nuevo login → canal email. Se corta en la primera
      // política desactivada.
      const featureNotifications =
        await this.tenantConfigService.getPolicyValue(
          user?.tenantId,
          user?.company,
          'features.notificaciones',
        );
      if (featureNotifications === false) return false;
      const global = await this.tenantConfigService.getPolicyValue(
        user?.tenantId,
        user?.company,
        'preferences.notifications',
      );
      if (global === false) return false;
      const newLogin = await this.tenantConfigService.getPolicyValue(
        user?.tenantId,
        user?.company,
        'preferences.notifications.newLogin',
      );
      if (newLogin === false) return false;
      const emailEnabled = await this.tenantConfigService.getPolicyValue(
        user?.tenantId,
        user?.company,
        'channels.email.enabled',
      );
      return emailEnabled !== false;
    } catch (error: any) {
      // Fail-closed: si no se puede resolver la política, no se envía el correo.
      this.logger.warn(
        `No se pudo resolver la política de notificación de nuevo login: ${error?.message}`,
      );
      return false;
    }
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      // 1. Verificar firma y expiración del refresh token
      const decoded: any = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
        issuer: this.configService.get<string>('JWT_ISSUER', 'bponet-auth'),
        audience: this.configService.get<string>(
          'JWT_AUDIENCE',
          'bponet-apps',
        ),
      });

      const sid = decoded?.sid;
      if (!sid) {
        throw new ForbiddenException('Invalid refresh token');
      }

      // 2. Localizar la sesión activa por su id (el refresh token lleva `sid`)
      const session: any = await this.sessionsService.findActiveById(sid);
      if (!session) {
        throw new ForbiddenException('Invalid or expired refresh token');
      }

      const presentedHash = this.hashToken(refreshToken);
      const used: string[] = session.usedRefreshTokens || [];

      // 2.a. Reuso: el token presentado ya fue rotado → posible robo.
      if (session.refreshToken !== presentedHash && used.includes(presentedHash)) {
        await this.sessionsService.revokeByUser(session.user);
        this.audit({
          action: 'refresh.reuse',
          category: 'auth',
          status: 'failed',
          userId: String(session.user),
          email: session.email,
          company: session.company,
          tenantId: session.tenantId,
          detail: { sessionId: String(session._id) },
        });
        throw new ForbiddenException(
          'Sesión revocada por reutilización de token',
        );
      }

      // 2.b. El token presentado no es el vigente ni uno usado → inválido.
      if (session.refreshToken !== presentedHash) {
        throw new ForbiddenException('Invalid refresh token');
      }

      const user = await this.userModel.findById(session.user).lean().exec();
      if (!user || !user.isActived) {
        throw new ForbiddenException('User is inactive or no longer exists');
      }

      // 3. Rotar el refresh token y emitir un nuevo access token.
      const newRefreshToken = this.getJwtToken(
        { _id: session.user, sid: String(session._id) },
        this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
      );
      await this.sessionsService.rotateRefreshToken(
        String(session._id),
        this.hashToken(newRefreshToken),
        presentedHash,
      );

      const newPayload = buildIdentityPayload(user, String(session._id));
      const accessToken = this.getJwtToken(
        newPayload,
        this.configService.get<string>('JWT_SECRET'),
        this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
      );

      this.audit({
        action: 'refresh',
        category: 'auth',
        status: 'success',
        userId: String(user._id as any),
        email: user.email,
        company: user.company,
        tenantId: user.tenantId,
        detail: { sessionId: String(session._id) },
      });

      return {
        statusCode: 200,
        status: 'Success',
        message: 'Token refreshed successfully',
        accessToken,
        refreshToken: newRefreshToken,
        payload: newPayload,
      };
    } catch (error) {
      // Errores de negocio ya tipados se propagan tal cual (p. ej. reuso).
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // Si el refresh token expiró, desactivamos la sesión (mejor esfuerzo)
      if (error?.name === 'TokenExpiredError') {
        this.sessionsService
          .deactivateByRefreshHash(this.hashToken(refreshToken))
          .catch(() => undefined);
      }
      this.audit({
        action: 'refresh.failed',
        category: 'auth',
        status: 'failed',
        detail: { reason: error?.name || 'invalid' },
      });
      throw new ForbiddenException('Invalid refresh token');
    }
  }

  async logout(refreshToken?: string) {
    let session: any = null;
    if (refreshToken) {
      const hash = this.hashToken(refreshToken);
      session = await this.sessionsService.findActiveByRefreshHash(hash);
      await this.sessionsService.deactivateByRefreshHash(hash);
    }
    this.audit({
      action: 'logout',
      category: 'auth',
      status: 'success',
      userId: session?.user ? String(session.user) : undefined,
      email: session?.email,
      company: session?.company,
      tenantId: session?.tenantId,
      detail: session?._id ? { sessionId: String(session._id) } : {},
    });
    return {
      message: 'Logout successful',
      meta: { totalData: 1 },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async recoveryPassword(recovery: RecoveryPassword, redirectUri?: string) {
    // Respuesta genérica siempre (anti-enumeración): no revelamos si el correo
    // existe. Se envía el correo únicamente cuando el usuario existe.
    const genericResponse = {
      message:
        'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña',
      meta: { totalData: 1 },
    };
    try {
      const userDB = await this.userModel
        .findOne({ email: recovery.email })
        .exec();

      if (!userDB) {
        return genericResponse;
      }

      const appUrl = redirectUri || DEFAULT_FRONT_URL;

      // Token de un solo uso (mismo patrón que la invitación).
      const { raw, hash, expires } = this.generateOneTimeToken();
      userDB.passwordResetToken = hash;
      userDB.passwordResetExpires = expires;
      await userDB.save();

      const resetUrl = `${appUrl.replace(/\/+$/, '')}/set-password?token=${raw}`;

      await this.mailService.sendEmail({
        to: userDB.email,
        subject: 'Recuperación de contraseña - BpoNet',
        template: 'recovery',
        tenantId: userDB.tenantId,
        company: userDB.company,
        context: {
          name: userDB.name,
          platform_name: 'BpoNet',
          reset_url: resetUrl,
          login_url: appUrl,
        },
      });

      return genericResponse;
    } catch (error) {
      // No filtrar detalles internos; respuesta genérica.
      this.logger.error(
        `Error en recuperación de contraseña: ${error?.message}`,
        error?.stack,
      );
      return genericResponse;
    }
  }

  /** Genera un token de un solo uso: valor crudo, hash (BD) y expiración. */
  private generateOneTimeToken(): {
    raw: string;
    hash: string;
    expires: Date;
  } {
    const raw = crypto.randomBytes(32).toString('hex');
    return {
      raw,
      hash: this.hashToken(raw),
      expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hora
    };
  }

  /** Envía (o reenvía) el correo de verificación con token de un solo uso. */
  async resendEmailVerification(userId: string, frontUrl?: string) {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (user.emailVerifiedAt) {
      return { message: 'El correo ya está verificado' };
    }

    const raw = applyVerificationToken(user);
    await user.save();
    await sendVerificationEmail(this.mailService, user, raw, frontUrl);

    return { message: 'Correo de verificación enviado' };
  }

  /** Verifica el correo con un token de un solo uso. */
  async verifyEmail(token: string) {
    if (!token) {
      throw new BadRequestException('Token inválido o expirado');
    }
    const hash = this.hashToken(token);
    const user = await this.userModel
      .findOne({
        emailVerificationToken: hash,
        emailVerificationExpires: { $gt: new Date() },
      })
      .exec();

    if (!user) {
      throw new BadRequestException('Token inválido o expirado');
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return { message: 'Correo verificado exitosamente' };
  }

  async changePassword(changePassword: ChangePassword) {
    try {
      const userDB = await this.userModel
        .findOne({ _id: changePassword.id })
        .exec();

      if (!userDB) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const isPasswordValid = await this.encryptionService.verifyPassword(
        changePassword.currentPassword,
        userDB.password,
      );

      if (!isPasswordValid) {
        throw new BadRequestException('La contraseña actual es incorrecta');
      }
      const hashedPassword = await this.encryptionService.hashPassword(
        changePassword.newPassword,
      );
      const result = await this.userModel
        .findOneAndUpdate(
          { _id: changePassword.id },
          {
            password: hashedPassword,
            isNewUser: false,
            mustChangePassword: false,
            modified: new Date(),
          },
          {
            new: true,
          },
        )
        .exec();

      return {
        message: 'Contraseña cambiada correctamente',
        data: result?.name + ' ' + result?.lastName,
        meta: {
          totalData: 1,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  async setPasswordWithToken(setPasswordDto: SetPasswordWithToken) {
    const { token, password } = setPasswordDto;

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.userModel.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      throw new BadRequestException('Token inválido o expirado.');
    }

    // El pre-save de User se encargará de hashear la contraseña
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    // El usuario ya estableció su contraseña por invitación: no se le debe
    // volver a exigir el cambio al iniciar sesión.
    user.isNewUser = false;
    user.mustChangePassword = false;

    await user.save();

    return {
      message: 'Contraseña establecida exitosamente. Ya puedes iniciar sesión.',
    };
  }

  private getJwtToken(payload: any, secret?: string, expiresIn?: string) {
    return this.jwtService.sign(payload, {
      secret:
        secret || this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn:
        expiresIn ||
        this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
      algorithm: 'HS256',
      issuer: this.configService.get<string>('JWT_ISSUER', 'bponet-auth'),
      audience: this.configService.get<string>(
        'JWT_AUDIENCE',
        'bponet-apps',
      ),
    });
  }
}
