import {
  CanActivate,
  ExecutionContext,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerException } from '@nestjs/throttler';
import * as crypto from 'crypto';

interface Bucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;

const DEFAULT_LIMITS: Record<string, number> = {
  msLogin: 5,
  msRefresh: 10,
  msRecoveryPassword: 10,
  msValidateUser: 6000,
  msValidateSession: 6000,
};

const DEFAULT_LIMIT_FALLBACK = 100;

/** Variable de entorno por comando (limit) y fallback global. */
const LIMIT_ENV: Record<string, string> = {
  msLogin: 'RPC_THROTTLE_LOGIN',
  msRefresh: 'RPC_THROTTLE_REFRESH',
  msRecoveryPassword: 'RPC_THROTTLE_CHANGE_PASSWORD',
  msValidateUser: 'RPC_THROTTLE_VALIDATE',
  msValidateSession: 'RPC_THROTTLE_VALIDATE',
};

/**
 * Rate limiting para el canal TCP (`@MessagePattern`), que el
 * `ThrottlerHybridGuard` deja exento. Se aplica por comando (handler) y por
 * emisor (`serviceKey`). Límites configurables por entorno. Por instancia
 * (Redis en multi-instancia).
 *
 * Registrado como `APP_GUARD` después de `ServiceAuthGuard`.
 */
@Injectable()
export class RpcThrottlerGuard implements CanActivate, OnModuleDestroy {
  private readonly enabled: boolean;
  private readonly defaultLimit: number;
  private readonly limits: Map<string, number>;
  private readonly buckets = new Map<string, Bucket>();
  private readonly sweeper: ReturnType<typeof setInterval>;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      String(
        this.configService.get<string>('RPC_THROTTLE_ENABLED', 'true'),
      ).toLowerCase() !== 'false';

    this.defaultLimit = this.readLimit(
      'RPC_THROTTLE_DEFAULT',
      DEFAULT_LIMIT_FALLBACK,
    );

    this.limits = new Map<string, number>();
    for (const [cmd, fallback] of Object.entries(DEFAULT_LIMITS)) {
      const envKey = LIMIT_ENV[cmd];
      this.limits.set(
        cmd,
        envKey ? this.readLimit(envKey, fallback) : fallback,
      );
    }

    this.sweeper = setInterval(() => this.purgeExpired(), DEFAULT_WINDOW_MS);
    this.sweeper.unref?.();
  }

  private readLimit(envKey: string, fallback: number): number {
    const raw = Number(this.configService.get<string>(envKey, String(fallback)));
    return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
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
    const limit = this.limits.get(cmd) ?? this.defaultLimit;
    if (limit <= 0) return true; // 0 = sin límite
    const key = `${cmd}:${this.identity(data?.serviceKey)}`;

    const now = Date.now();
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + DEFAULT_WINDOW_MS });
      return true;
    }

    bucket.count += 1;
    if (bucket.count > limit) {
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
