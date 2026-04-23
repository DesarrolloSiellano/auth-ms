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
}
