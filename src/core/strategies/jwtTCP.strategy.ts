import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/users/entities/user.entity';
import { toPublicUser } from 'src/users/helpers/user.sanitizer';
import { Model } from 'mongoose';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { SessionsService } from 'src/sessions/sessions.service';

@Injectable()
export class JwtTCPStrategy {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly sessionsService: SessionsService,
  ) {
    this.secret = configService.getOrThrow<string>('JWT_SECRET');
    this.issuer = configService.get<string>('JWT_ISSUER', 'bponet-auth');
    this.audience = configService.get<string>('JWT_AUDIENCE', 'bponet-apps');
  }

  async validate(token: string) {
    if (!token) {
      throw new UnauthorizedException('Token es requerido');
    }

    // Elimina el prefijo 'Bearer ' si existe
    if (token.startsWith('Bearer ')) {
      token = token.slice(7, token.length);
    }

    try {
      const payload = jwt.verify(token, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      }) as JwtPayload;
      const { _id, sid } = payload;

      // Fail-closed: todo token debe referenciar una sesión revocable.
      if (!sid) {
        throw new UnauthorizedException('Sesión no válida');
      }

      // Revocación inmediata: la sesión debe seguir activa.
      const active = await this.sessionsService.isSessionActive(sid);
      if (!active) {
        throw new UnauthorizedException('Sesión revocada o expirada');
      }

      const user = await this.userModel.findById(_id).lean().exec();
      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }
      return toPublicUser(user);
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('SESSION_EXPIRED');
      }
      throw new UnauthorizedException('Token inválido');
    }
  }
}
