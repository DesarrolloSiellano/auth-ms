import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { ConfigService } from '@nestjs/config';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { User } from 'src/users/entities/user.entity';
import { toPublicUser } from 'src/users/helpers/user.sanitizer';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SessionsService } from 'src/sessions/sessions.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly sessionsService: SessionsService,
  ) {
    super({
      secretOrKey: configService.getOrThrow('JWT_SECRET'),
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      algorithms: ['HS256'],
      issuer: configService.get<string>('JWT_ISSUER', 'bponet-auth'),
      audience: configService.get<string>('JWT_AUDIENCE', 'bponet-apps'),
    });
  }

  async validate(payload: JwtPayload): Promise<User> {
    const { _id, sid } = payload;

    // Fail-closed: todo token debe referenciar una sesión revocable.
    if (!sid) {
      throw new UnauthorizedException('Sesión no válida');
    }

    // Revocación inmediata: si el token referencia una sesión, debe seguir activa.
    const active = await this.sessionsService.isSessionActive(sid);
    if (!active) {
      throw new UnauthorizedException('Sesión revocada o expirada');
    }

    const user = await this.userModel.findById(_id).lean().exec();

    if (!user) {
      throw new UnauthorizedException('Token no valid');
    }
    if (!user.isActived) {
      throw new UnauthorizedException(
        'User is not active, please talk to the administrator',
      );
    }
    return toPublicUser(user) as User;
  }
}
