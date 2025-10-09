import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/users/entities/user.entity';
import { Model } from 'mongoose';
import { UserPayload } from '../interfaces/user-payload.interface';

@Injectable()
export class JwtTCPStrategy {
  private readonly secret: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel('User') private readonly userModel: Model<User>,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET no está definido en la configuración');
    }
    this.secret = secret;
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
      const payload = jwt.verify(token, this.secret) as UserPayload;
      const { _id } = payload;
      const user = await this.userModel.findById(_id).exec();
      return user;
    } catch (err) {
      throw new UnauthorizedException('Token inválido');
    }
  }
}
