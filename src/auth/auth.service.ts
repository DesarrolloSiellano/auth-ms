import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Login, ChangePassword, RecoveryPassword } from './dto/auth.dto';
import { EncryptionService } from 'src/core/services/encryption.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import * as generatePassword from 'generate-password';
import { MailService } from 'src/mail/mail.service';
import { SessionsService } from 'src/sessions/sessions.service';
import * as crypto from 'crypto';
import { SetPasswordWithToken } from './dto/auth.dto';
import { buildIdentityPayload } from './helpers/identity-payload.helper';

@Injectable()
export class AuthService {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly sessionsService: SessionsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  async login(login: Login, ip: string = '') {
    const { meta } = login;
    const userDB = await this.userModel
      .findOne({ email: login.email })
      .lean()
      .exec();

    if (!userDB) {
      throw new ForbiddenException('Usuario no encontrado');
    }

    const isPasswordValid = await this.encryptionService.verifyPassword(
      login.password,
      userDB.password,
    );

    if (!isPasswordValid) {
      throw new ForbiddenException('Creadenciales invalidas');
    }

    if (!userDB.isActived) {
      throw new ForbiddenException(
        'Usuario no activo, comuniquese con el administrador',
      );
    }

    const payload = buildIdentityPayload(userDB);

    const accessToken = this.getJwtToken(
      payload,
      this.configService.get<string>('JWT_SECRET'),
      this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
    );

    const refreshToken = this.getJwtToken(
      { _id: userDB._id }, // Refresh token redundant payload for security
      this.configService.get<string>('JWT_REFRESH_SECRET'),
      this.configService.get<string>('JWT_REFRESH_EXPIRATION', '7d'),
    );

    const session = {
      user: userDB._id,
      name: userDB.name + ' ' + userDB.lastName,
      email: userDB.email,
      company: userDB.company,
      tenantId: userDB.tenantId || userDB.company || '0000000',
      ip: ip,
      user_gent: meta?.user_agent || '',
      os: meta?.os || '',
      os_version: meta?.os_version || '',
      browser: meta?.browser || '',
      browser_version: meta?.browser_version || '',
      istable: meta?.istable || false,
      ismovil: meta?.ismovil || false,
      isbrowser: meta?.isbrowser || false,
      refreshToken: this.hashToken(refreshToken), // Store hashed refresh token
    };

    await this.sessionsService.createSession(session as any);

    return {
      message: 'Login successful',
      meta: {
        payload,
        token: accessToken, // Alias para compatibilidad con el front viejo
        accessToken,
        refreshToken,
        totalData: 1,
      },
    };
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
      const newPayload = buildIdentityPayload(user);

      const accessToken = this.getJwtToken(
        newPayload,
        this.configService.get<string>('JWT_SECRET'),
        this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
      );

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
      throw new ForbiddenException('Invalid refresh token');
    }
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
        isNewUser: true, // para forzar cambio en siguiente login (opcional)
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
          { password: hashedPassword, isNewUser: false, modified: new Date() },
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
