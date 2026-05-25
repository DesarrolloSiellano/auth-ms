import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class ThrottlerHybridGuard extends ThrottlerGuard {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = context.getType();
    // Si es una petición de microservicio (RPC), ignoramos el throttling
    if (type === 'rpc') {
      return true;
    }
    // Para HTTP (y otros), usamos el comportamiento estándar
    return super.canActivate(context);
  }

  // Obtiene la IP real del cliente detrás de un proxy (Docker/Nginx)
  protected getTracker(req: Record<string, any>): Promise<string> {
    const forwardedFor = req.headers?.['x-forwarded-for'];
    if (forwardedFor) {
      return Promise.resolve(
        typeof forwardedFor === 'string'
          ? forwardedFor.split(',')[0].trim()
          : forwardedFor[0],
      );
    }
    return Promise.resolve(req.ip || req.connection?.remoteAddress || '');
  }
}
