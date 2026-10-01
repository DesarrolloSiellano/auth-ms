import {
  ForbiddenException,
  Injectable,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Session } from './entities/session.entity';
import { User } from 'src/users/entities/user.entity';

interface SessionCacheEntry {
  active: boolean;
  expiresAt: number;
}

@Injectable()
export class SessionsService implements OnModuleDestroy {
  /** 0 = sin caché (revocación inmediata entre instancias). */
  private readonly CACHE_TTL_MS: number;
  /** Límite duro de entradas para evitar crecimiento sin control. */
  private readonly CACHE_MAX = 10_000;
  private readonly activeCache = new Map<string, SessionCacheEntry>();
  private readonly sweeper?: ReturnType<typeof setInterval>;

  constructor(
    @InjectModel('Session') private readonly sessionModel: Model<Session>,
    @Optional()
    @InjectModel('User')
    private readonly userModel?: Model<User>,
    @Optional() private readonly configService?: ConfigService,
  ) {
    const ttl = Number(
      this.configService?.get<string>('SESSION_CACHE_TTL_MS', '30000'),
    );
    this.CACHE_TTL_MS = Number.isFinite(ttl) && ttl >= 0 ? ttl : 30_000;

    // Purga periódica de entradas expiradas. `unref()` evita que el timer
    // mantenga vivo el proceso (y no bloquea tests). Con TTL 0 no hay caché.
    if (this.CACHE_TTL_MS > 0) {
      this.sweeper = setInterval(() => this.purgeExpired(), this.CACHE_TTL_MS);
      this.sweeper.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.sweeper) clearInterval(this.sweeper);
    this.activeCache.clear();
  }

  /**
   * Filtro de alcance: un admin no-super (scoped por empresa) no puede ver ni
   * revocar sesiones de SuperAdmins.
   */
  private scopeFilter(company?: string): Record<string, any> {
    return company ? { company, isSuperAdmin: { $ne: true } } : {};
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.activeCache) {
      if (entry.expiresAt <= now) this.activeCache.delete(key);
    }
  }

  private evictIfNeeded(): void {
    while (this.activeCache.size > this.CACHE_MAX) {
      const oldest = this.activeCache.keys().next().value;
      if (oldest === undefined) break;
      this.activeCache.delete(oldest);
    }
  }

  async createSession(data: Partial<Session>): Promise<Session> {
    const session = new this.sessionModel({
      ...data,
      lastActivityAt: new Date(),
    });
    return session.save();
  }

  async findActiveByRefreshHash(hash: string): Promise<Session | null> {
    return this.sessionModel
      .findOne({ refreshToken: hash, isActive: true })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
  }

  /** Busca una sesión activa por su id (usado en la rotación de refresh). */
  async findActiveById(sessionId: string): Promise<Session | null> {
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) return null;
    return this.sessionModel
      .findOne({ _id: sessionId, isActive: true })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
  }

  /**
   * Rota el refresh token de una sesión: guarda el hash nuevo, archiva el
   * anterior (para detección de reuso) y registra la actividad.
   */
  async rotateRefreshToken(
    sessionId: string,
    newHash: string,
    usedHash: string,
  ): Promise<void> {
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) return;
    await this.sessionModel
      .updateOne(
        { _id: sessionId, isActive: true },
        {
          $set: {
            refreshToken: newHash,
            refreshRotatedAt: new Date(),
            lastActivityAt: new Date(),
          },
          $push: {
            usedRefreshTokens: { $each: [usedHash], $slice: -5 },
          },
        },
      )
      .setOptions({ bypassTenant: true })
      .exec();
  }

  async deactivateByRefreshHash(hash: string): Promise<void> {
    const session = await this.sessionModel
      .findOne({ refreshToken: hash, isActive: true })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();
    if (!session) return;
    await this.revokeById((session._id as any).toString());
  }

  /** Registra actividad de la sesión (se llama en el refresh). */
  async touch(sessionId?: string): Promise<void> {
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) return;
    await this.sessionModel
      .updateOne(
        { _id: sessionId, isActive: true },
        { $set: { lastActivityAt: new Date() } },
      )
      .setOptions({ bypassTenant: true })
      .exec();
  }

  /**
   * Valida si una sesión sigue activa, con caché corta para no golpear la BD
   * en cada request. La revocación invalida la caché de inmediato.
   */
  async isSessionActive(sessionId?: string): Promise<boolean> {
    if (!sessionId || !Types.ObjectId.isValid(sessionId)) return false;

    if (this.CACHE_TTL_MS > 0) {
      const cached = this.activeCache.get(sessionId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.active;
      }
    }

    const session = await this.sessionModel
      .findOne({ _id: sessionId, isActive: true })
      .select('_id')
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const active = !!session;
    if (this.CACHE_TTL_MS > 0) {
      this.activeCache.set(sessionId, {
        active,
        expiresAt: Date.now() + this.CACHE_TTL_MS,
      });
      this.evictIfNeeded();
    }
    return active;
  }

  private invalidate(sessionIds: string[]): void {
    sessionIds.forEach((id) => this.activeCache.delete(id));
  }

  // -------------------------------------------------------------- Consultas

  async findActiveSessions(params: {
    company?: string;
    email?: string;
    userId?: string;
    from?: number;
    limit?: number;
  }) {
    const query: any = { isActive: true, ...this.scopeFilter(params.company) };
    if (params.userId) query.user = params.userId;
    if (params.email) {
      query.email = new RegExp(params.email, 'i');
    }

    const from = params.from && params.from >= 0 ? params.from : 0;
    const limit = params.limit && params.limit > 0 ? params.limit : 50;

    const [data, totalData] = await Promise.all([
      this.sessionModel
        .find(query)
        .select('-refreshToken')
        .sort({ lastActivityAt: -1 })
        .skip(from)
        .limit(limit)
        .setOptions({ bypassTenant: true })
        .lean()
        .exec(),
      this.sessionModel
        .countDocuments(query)
        .setOptions({ bypassTenant: true })
        .exec(),
    ]);

    return {
      message: 'Active sessions retrieved successfully',
      data,
      meta: { totalData },
    };
  }

  // ------------------------------------------------------- Autoservicio

  /** Sesiones activas del propio usuario (cualquier rol). */
  async findMine(userId: string) {
    const data = await this.sessionModel
      .find({ user: userId, isActive: true })
      .select('-refreshToken')
      .sort({ lastActivityAt: -1 })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    return {
      message: 'Mis sesiones activas',
      data,
      meta: { totalData: data.length },
    };
  }

  /** Revoca una sesión propia validando la pertenencia. */
  async revokeMine(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) return null;

    const session = await this.sessionModel
      .findOneAndUpdate(
        { _id: id, user: userId, isActive: true },
        { $set: { isActive: false } },
        { new: true },
      )
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    if (session) this.invalidate([String((session as any)._id)]);
    return session;
  }

  /** Revoca todas las sesiones activas del propio usuario. */
  async revokeAllMine(userId: string): Promise<number> {
    const sessions = await this.sessionModel
      .find({ user: userId, isActive: true })
      .select('_id')
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const result = await this.sessionModel
      .updateMany(
        { user: userId, isActive: true },
        { $set: { isActive: false } },
      )
      .setOptions({ bypassTenant: true })
      .exec();

    this.invalidate(sessions.map((s: any) => String(s._id)));
    return result.modifiedCount ?? 0;
  }

  // ------------------------------------------------------------- Revocación

  async revokeById(id: string, company?: string) {
    const query: any = { _id: id, isActive: true, ...this.scopeFilter(company) };

    const session = await this.sessionModel
      .findOneAndUpdate(query, { $set: { isActive: false } }, { new: true })
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    if (session) this.invalidate([(session._id as any).toString()]);
    return session;
  }

  async revokeByUser(userId: string, company?: string): Promise<number> {
    // Un admin (alcance por empresa) no puede revocar sesiones de un
    // SuperAdmin, aunque pertenezca a su misma empresa.
    if (company && this.userModel) {
      const target = await this.userModel
        .findById(userId)
        .select('isSuperAdmin')
        .lean()
        .exec();
      if (target?.isSuperAdmin) {
        throw new ForbiddenException(
          'No puedes revocar sesiones de un SuperAdmin',
        );
      }
    }

    const query: any = {
      user: userId,
      isActive: true,
      ...this.scopeFilter(company),
    };

    const sessions = await this.sessionModel
      .find(query)
      .select('_id')
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const result = await this.sessionModel
      .updateMany(query, { $set: { isActive: false } })
      .setOptions({ bypassTenant: true })
      .exec();

    this.invalidate(sessions.map((s: any) => String(s._id)));
    return result.modifiedCount ?? 0;
  }

  async revokeMany(ids: string[], company?: string): Promise<number> {
    const query: any = {
      _id: { $in: ids.filter((id) => Types.ObjectId.isValid(id)) },
      isActive: true,
      ...this.scopeFilter(company),
    };

    const sessions = await this.sessionModel
      .find(query)
      .select('_id')
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const result = await this.sessionModel
      .updateMany(query, { $set: { isActive: false } })
      .setOptions({ bypassTenant: true })
      .exec();

    this.invalidate(sessions.map((s: any) => String(s._id)));
    return result.modifiedCount ?? 0;
  }

  async revokeAll(company?: string): Promise<number> {
    const query: any = { isActive: true, ...this.scopeFilter(company) };

    const sessions = await this.sessionModel
      .find(query)
      .select('_id')
      .setOptions({ bypassTenant: true })
      .lean()
      .exec();

    const result = await this.sessionModel
      .updateMany(query, { $set: { isActive: false } })
      .setOptions({ bypassTenant: true })
      .exec();

    this.invalidate(sessions.map((s: any) => String(s._id)));
    return result.modifiedCount ?? 0;
  }
}
