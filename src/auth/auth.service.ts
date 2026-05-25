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
import { Session } from 'src/sessions/entities/session.entity';
import * as crypto from 'crypto';
import { SetPasswordWithToken } from './dto/auth.dto';

@Injectable()
export class AuthService {
  url = 'https://app.bponet.com.co';
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Session') private readonly sessionModel: Model<Session>,
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

    const payload = {
      _id: userDB._id,
      name: userDB.name,
      lastName: userDB.lastName,
      email: userDB.email,
      username: userDB.username,
      date_joined: userDB.created,
      isActived: userDB.isActived,
      isAdmin: userDB.isAdmin,
      isSuperAdmin: userDB.isSuperAdmin,
      isNewUser: userDB.isNewUser,
      company: userDB.company,
      tenantId: userDB.tenantId,
      modules: userDB.modules,
      roles: userDB.roles,
      permissions: userDB.permissions,
    };

    console.log('payload', payload);

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
      refreshToken, // Store the refresh token
    };

    const newSession = new this.sessionModel(session);
    await newSession.save();

    this.mailService
      .sendEmail({
        to: login.email,
        subject: 'Inicio de sesión - BpoNet',
        template: 'session',
        context: {
          name: session.name,
          platform_name: 'BpoNet',
          os: meta?.os || '',
          browser: meta?.browser || '',
          user_agent: meta?.user_agent || '',
        },
      })
      .catch((error) => {
        console.log(error, error);
      });

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
      // 1. Verify Refresh Token
      /*  const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      }); */

      // 2. Find Session and User
      const session = await this.sessionModel
        .findOne({ refreshToken, isActive: true })
        .exec();

      if (!session) {
        throw new ForbiddenException('Invalid or expired refresh token');
      }

      const user = await this.userModel.findById(session.user).exec();
      if (!user || !user.isActived) {
        throw new ForbiddenException('User is inactive or no longer exists');
      }

      // 3. Generate New Access Token
      const newPayload = {
        _id: user._id,
        name: user.name,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        date_joined: user.created,
        isActived: user.isActived,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin,
        isNewUser: user.isNewUser,
        company: user.company,
        modules: user.modules,
        roles: user.roles,
        permissions: user.permissions,
      };

      const accessToken = this.getJwtToken(
        newPayload,
        this.configService.get<string>('JWT_SECRET'),
        this.configService.get<string>('JWT_ACCESS_EXPIRATION', '1h'),
      );

      return {
        accessToken,
        payload: newPayload,
      };
    } catch (error) {
      console.log(error, error);
      throw new ForbiddenException('Invalid refresh token');
    }
  }

  async recoveryPassword(recovery: RecoveryPassword, redirectUri: string) {
    try {
      const userDB = await this.userModel
        .findOne({ email: recovery.email })
        .exec();

      if (!userDB) {
        throw new NotFoundException('Usuario no encontrado');
      }

      if (redirectUri) {
        this.url = redirectUri;
      }

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
          login_url: this.url, // url de login real de tu app
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
    console.log(changePassword);
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
      secret: secret || this.configService.get<string>('JWT_SECRET'),
      expiresIn:
        expiresIn || this.configService.get<string>('JWT_EXPIRATION', '30d'),
    });
  }
}
