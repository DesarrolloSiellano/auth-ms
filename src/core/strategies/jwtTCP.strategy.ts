import { Injectable, OnModuleDestroy, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { User } from 'src/users/entities/user.entity';
import { toPublicUser } from 'src/users/helpers/user.sanitizer';
import { Model } from 'mongoose';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { SessionsService } from 'src/sessions/sessions.service';

interface UserCacheEntry {
  user: any;
  expiresAt: number;
}

export interface SessionCheckResult {
  active: boolean;
  valid: boolean;
  reason?: string;
}

@Injectable()
export class JwtTCPStrategy implements OnModuleDestroy {
  private readonly secret: string;
  private readonly issuer: string;
  private readonly audience: string;
  private readonly userCacheTtlMs: number;
  private readonly userCache = new Map<string, UserCacheEntry>();
  private readonly sweeper?: ReturnType<typeof setInterval>;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel('User') private readonly userModel: Model<User>,
    private readonly sessionsService: SessionsService,
  ) {
    this.secret = configService.getOrThrow<string>('JWT_SECRET');
    this.issuer = configService.get<string>('JWT_ISSUER', 'bponet-auth');
    this.audience = configService.get<string>('JWT_AUDIENCE', 'bponet-apps');
    const ttl = Number(
      configService.get<string>('JWT_USER_CACHE_TTL_MS', '5000'),
    );
    this.userCacheTtlMs = Number.isFinite(ttl) && ttl >= 0 ? ttl : 5000;
    if (this.userCacheTtlMs > 0) {
      this.sweeper = setInterval(() => this.purge(), this.userCacheTtlMs);
      this.sweeper.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.userCache.clear();
  }

  /** Verifica un access token y devuelve el usuario sanitizado. */
  async validate(token: string) {
    const payload = this.verify(token);
    const { _id, sid } = payload;

    // Fail-closed: todo token debe referenciar una sesión revocable.
    if (!sid) {
      throw new UnauthorizedException('Sesión no válida');
    }

    const active = await this.sessionsService.isSessionActive(sid);
    if (!active) {
      throw new UnauthorizedException('Sesión revocada o expirada');
    }

    const user = await this.findUserCached(String(_id));
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return user;
  }

  /**
   * Verifica solo la vigencia (firma + `sid` + sesión activa) sin lookup de
   * usuario. Pensado para validación por request desde apps externas.
   */
  async validateSessionOnly(token: string): Promise<SessionCheckResult> {
    try {
      const payload = this.verify(token);
      if (!payload?.sid) {
        return { active: false, valid: false, reason: 'Sesión no válida' };
      }
      const active = await this.sessionsService.isSessionActive(payload.sid);
      if (!active) {
        return {
          active: false,
          valid: false,
          reason: 'Sesión revocada o expirada',
        };
      }
      return { active: true, valid: true };
    } catch (error: any) {
      return {
        active: false,
        valid: false,
        reason: error?.message || 'Token inválido',
      };
    }
  }

  private verify(token: string): JwtPayload {
    if (!token) {
      throw new UnauthorizedException('Token es requerido');
    }
    let value = token;
    if (value.startsWith('Bearer ')) {
      value = value.slice(7);
    }
    try {
      return jwt.verify(value, this.secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
      }) as JwtPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new UnauthorizedException('SESSION_EXPIRED');
      }
      throw new UnauthorizedException('Token inválido');
    }
  }

  private async findUserCached(id: string): Promise<any> {
    if (!id) return null;
    if (this.userCacheTtlMs > 0) {
      const cached = this.userCache.get(id);
      if (cached && cached.expiresAt > Date.now()) return cached.user;
    }
    const user = await this.userModel.findById(id).lean().exec();
    if (!user) return null;
    const publicUser = toPublicUser(user);
    if (this.userCacheTtlMs > 0) {
      this.userCache.set(id, {
        user: publicUser,
        expiresAt: Date.now() + this.userCacheTtlMs,
      });
    }
    return publicUser;
  }

  private purge(): void {
    const now = Date.now();
    for (const [key, entry] of this.userCache) {
      if (entry.expiresAt <= now) this.userCache.delete(key);
    }
  }
}
