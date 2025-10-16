import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Login, ChangePassword, RecoveryPassword } from './dto/auth.dto';
import { EncryptionService } from 'src/core/services/encryption.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from 'src/users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from 'src/core/interfaces/jwt-payload.interface';
import * as generatePassword from 'generate-password';
import { MailService } from 'src/mail/mail.service';
import { ConfigService } from '@nestjs/config';
import { Session } from 'src/sessions/entities/session.entity';

@Injectable()
export class AuthService {
  url = 'https://app.bponet.com.co';
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly jwtService: JwtService,
    @InjectModel('User') private readonly userModel: Model<User>,
    @InjectModel('Session') private readonly sessionModel: Model<Session>,
    private readonly mailService: MailService,
  ) {}

  async login(login: Login, ip: string = '') {
    const { meta } = login;
    const userDB = await this.userModel.findOne({ email: login.email }).exec();

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
      modules: userDB.modules,
      roles: userDB.roles,
      permissions: userDB.permissions,
    };

    const token = this.getJwtToken(payload);

    const session = {
      user: userDB._id,
      name: userDB.name + ' ' + userDB.lastName,
      email: userDB.email,
      company: userDB.company,
      ip: ip,
      user_gent: meta?.user_agent || '',
      os: meta?.os || '',
      os_version: meta?.os_version || '',
      browser: meta?.browser || '',
      browser_version: meta?.browser_version || '',
      istable: meta?.istable || false,
      ismovil: meta?.ismovil || false,
      isbrowser: meta?.isbrowser || false, // 1 hora
    };

    const newSession = new this.sessionModel(session);
    await newSession.save();

    this.mailService.sendEmail({
      to: login.email,
      subject: 'Inicio de sesión - BpoNet',
      template: 'session', // nombre del archivo welcome.hbs
      context: {
        name: session.name,
        platform_name: 'BpoNet',
        os: meta?.os || '',
        browser: meta?.browser || '',
        user_agent: meta?.user_agent || '', // url de login real de tu app
      },
    });

    return {
      message: 'Login successful',
      statusCode: 200,
      status: 'Success',
      meta: {
        payload,
        totalData: 1,
        token,
      },
    };
  }

  async recoveryPassword(recovery: RecoveryPassword) {
    try {
      const userDB = await this.userModel
        .findOne({ email: recovery.email })
        .exec();

      if (!userDB) {
        return {
          message: 'Usuario no encontrado',
          statusCode: 404,
          status: 'Error',
          meta: { totalData: 0 },
        };
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
        return {
          message: 'Error al actualizar la contraseña',
          statusCode: 500,
          status: 'Error',
          meta: { totalData: 0 },
        };
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
        statusCode: 200,
        status: 'Success',
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
        return {
          message: 'Usuario no encontrado',
          statusCode: 404,
          status: 'Error',
          meta: {
            totalData: 0,
          },
        };
      }

      const isPasswordValid = await this.encryptionService.verifyPassword(
        changePassword.currentPassword,
        userDB.password,
      );

      if (!isPasswordValid) {
        return {
          message: 'La contraseña actual es incorrecta',
          statusCode: 400,
          status: 'Error',
          meta: {
            totalData: 0,
          },
        };
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
        statusCode: 201,
        status: 'Success',
        data: result?.name + ' ' + result?.lastName,
        meta: {
          totalData: 1,
        },
      };
    } catch (error) {
      throw new BadRequestException(error.message);
    }
  }

  private getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }
}
