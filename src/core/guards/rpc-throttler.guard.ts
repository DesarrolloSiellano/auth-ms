import {
  CanActivate,
  ExecutionContext,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';

interface RpcLimit {
  limit: number;
  ttlMs: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;

/** Límites por comando TCP (handler method name). Ventana de 60s. */
const RPC_LIMITS: Record<string, RpcLimit> = {
  msLogin: { limit: 5, ttlMs: DEFAULT_WINDOW_MS },
  msRefresh: { limit: 10, ttlMs: DEFAULT_WINDOW_MS },
  msRecoveryPassword: { limit: 10, ttlMs: DEFAULT_WINDOW_MS },
  msValidateUser: { limit: 600, ttlMs: DEFAULT_WINDOW_MS },
  msValidateSession: { limit: 600, ttlMs: DEFAULT_WINDOW_MS },
};

const DEFAULT_LIMIT: RpcLimit = { limit: 100, ttlMs: DEFAULT_WINDOW_MS };

/**
 * Rate limiting para el canal TCP (`@MessagePattern`), que el
 * `ThrottlerHybridGuard` deja exento. Se aplica por comando (handler) y por
 * emisor (`serviceKey`). El límite es por instancia (Redis en multi-instancia).
 *
 * Registrado como `APP_GUARD` después de `ServiceAuthGuard`.
 */
@Injectable()
export class RpcThrottlerGuard implements CanActivate, OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      String(
        this.configService.get<string>('RPC_THROTTLE_ENABLED', 'true'),
      ).toLowerCase() !== 'false';
    this.sweeper = setInterval(() => this.purgeExpired(), DEFAULT_WINDOW_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy(): void {
    clearInterval(this.sweeper);
    this.buckets.clear();
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.enabled) return true;
    // Solo aplica al canal TCP; el HTTP lo cubre ThrottlerHybridGuard.
    if (context.getType() !== 'rpc') return true;

    const cmd = context.getHandler()?.name || 'unknown';
    const data = context.switchToRpc()?.getData?.() || {};
    const limit = RPC_LIMITS[cmd] || DEFAULT_LIMIT;
    const key = `${cmd}:${this.identity(data?.serviceKey)}`;

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + limit.ttlMs });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > limit.limit) {
      throw new ThrottlerException('Demasiadas solicitudes por TCP');
    }
    return true;
  }

  /** Identifica al emisor sin almacenar la clave en claro. */
  private identity(serviceKey?: string): string {
    return crypto
      .createHash('sha256')
      .update(serviceKey || 'anon')
      .digest('hex')
      .slice(0, 16);
  }

  private purgeExpired(): void {
    const now = Date.now();
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
