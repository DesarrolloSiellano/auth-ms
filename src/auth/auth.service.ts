import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import moment from 'moment';
import { AuditService, AuditEntry } from 'src/audit/audit.service';
import { Login, ChangePassword, RecoveryPassword } from './dto/auth.dto';
import { EncryptionService } from 'src/core/services/encryption.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from 'src/users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import * as generatePassword from 'generate-password';
import { MailService } from 'src/mail/mail.service';
import { SessionsService } from 'src/sessions/sessions.service';
import * as crypto from 'crypto';
import { SetPasswordWithToken } from './dto/auth.dto';
import { buildIdentityPayload } from './helpers/identity-payload.helper';
import { TenantConfigService } from 'src/tenant-config/tenant-config.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly tenantConfigService: TenantConfigService,
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
      throw new ForbiddenException('Usuario no encontrado');
    }

    const blockState = await this.checkBlock(userDB);
    if (blockState.blocked) {
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
        detail: { reason: 'blocked', blockedUntil: blockState.until },
      });
      throw new ForbiddenException(
        'Usuario bloqueado temporalmente. Intente nuevamente más tarde.',
      );
    }

    const isPasswordValid = await this.encryptionService.verifyPassword(
      login.password,
      userDB.password,
    );

    if (!isPasswordValid) {
      await this.registerFailedAttempt(userDB);
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
        detail: { reason: 'invalid_password' },
      });
      throw new ForbiddenException('Creadenciales invalidas');
    }

    if (!userDB.isActived) {
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
        detail: { reason: 'inactive_user' },
      });
      throw new ForbiddenException(
        'Usuario no activo, comuniquese con el administrador',
      );
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
  ): Promise<{ blocked: boolean; until?: string }> {
    if (!user?.isBlocked) return { blocked: false };
    const until = user.blockedUntil ? new Date(user.blockedUntil) : null;
    if (!until || until.getTime() <= Date.now()) {
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
      return { blocked: false };
    }
    return { blocked: true, until: until.toISOString() };
  }

  /**
   * Incrementa el contador de intentos fallidos y aplica bloqueo temporal
   * cuando se alcanza `security.maxFailedAttempts` del tenant.
   */
  private async registerFailedAttempt(user: any): Promise<void> {
    const attempts = Number(user?.failedLoginAttempts || 0) + 1;
    const max = Number(
      await this.tenantConfigService.getPolicyValue(
        user?.tenantId,
        user?.company,
        'security.maxFailedAttempts',
      ),
    );
    const minutes =
      Number(
        await this.tenantConfigService.getPolicyValue(
          user?.tenantId,
          user?.company,
          'security.lockMinutes',
        ),
      ) || 15;

    const update: any = {
      failedLoginAttempts: attempts,
      lastFailedLoginAt: new Date(),
    };

    if (max > 0 && attempts >= max) {
      update.isBlocked = true;
      update.blockedUntil = new Date(Date.now() + minutes * 60 * 1000);
      update.blockReason = 'auto';
      update.failedLoginAttempts = 0;
      this.audit({
        action: 'security.auto_lock',
        category: 'security',
        status: 'failed',
        userId: String(user._id),
        email: user.email,
        company: user.company,
        tenantId: user.tenantId,
        detail: { attempts, minutes },
      });
    }

    await this.userModel
      .updateOne({ _id: user._id }, { $set: update })
      .setOptions({ bypassTenant: true })
      .exec();
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
      const now = moment();
      await this.mailService.sendEmail({
        to: user.email,
        subject: 'Nuevo inicio de sesión - BpoNet',
        template: 'session',
        context: {
          name: user.name,
          platform_name: 'BpoNet',
          os: meta?.os || 'Desconocido',
          browser: meta?.browser || 'Desconocido',
          user_agent: meta?.user_agent || '',
          ip: ip || 'Desconocida',
          fecha: now.format('YYYY-MM-DD'),
          hora: now.format('HH:mm:ss'),
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
    } catch {
      return true;
    }
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      // 1. Verificar firma y expiración del refresh token
      this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      // 2. Buscar la sesión por el hash del token
      const session = await this.sessionsService.findActiveByRefreshHash(
        this.hashToken(refreshToken),
      );

      if (!session) {
        throw new ForbiddenException('Invalid or expired refresh token');
      }

      const user = await this.userModel.findById(session.user).lean().exec();
      if (!user || !user.isActived) {
        throw new ForbiddenException('User is inactive or no longer exists');
      }

      // 3. Generate New Access Token
      const newPayload = buildIdentityPayload(user, String(session._id));

      const accessToken = this.getJwtToken(
        newPayload,
        this.configService.get<string>('JWT_SECRET'),
        this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
      );

      await this.sessionsService.touch(String(session._id));

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
        payload: newPayload,
      };
    } catch (error) {
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

  async recoveryPassword(recovery: RecoveryPassword, redirectUri: string) {
    try {
      const userDB = await this.userModel
        .findOne({ email: recovery.email })
        .exec();

      if (!userDB) {
        throw new NotFoundException('Usuario no encontrado');
      }

      const loginUrl = redirectUri || 'https://app.bponet.com.co';

      // Generar contraseña temporal segura
      const tempPassword = generatePassword.generate({
        length: 12,
        numbers: true,
        uppercase: true,
        symbols: true,
        strict: true,
      });

      // Encriptar la contraseña temporal
      const hashedPassword =
        await this.encryptionService.hashPassword(tempPassword);

      // Actualizar la contraseña en la base de datos
      const result = await this.userModel.findByIdAndUpdate(userDB._id, {
        password: hashedPassword,
        isNewUser: true,
        mustChangePassword: true,
        modified: new Date(),
      });

      if (!result) {
        throw new InternalServerErrorException(
          'Error al actualizar la contraseña',
        );
      }

      // Enviar correo al usuario con la contraseña temporal
      const info = await this.mailService.sendEmail({
        to: result.email,
        subject: 'Recuperación de contraseña - BpoNet',
        template: 'recovery', // nombre del archivo welcome.hbs
        context: {
          name: result.name,
          platform_name: 'BpoNet',
          temporary_password: tempPassword, // si tienes la contraseña original aquí (revisar seguridad)
          login_url: loginUrl, // url de login real de tu app
        },
      });

      return {
        message: 'Contraseña temporal enviada por correo',
        meta: { totalData: 1, info },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
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
    user.isNewUser = false; // El usuario ya estableció su pass por primera vez

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
        expiresIn || this.configService.get<string>('JWT_EXPIRATION', '30d'),
    });
  }
}
