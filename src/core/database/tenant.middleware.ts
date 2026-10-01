import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/**
 * @deprecated El contexto de tenant ahora se establece con
 * `TenantContextInterceptor` (HTTP) y `RpcTenantContextInterceptor` (TCP) a
 * partir de identidad verificada. Este middleware quedó como no-op para evitar
 * que un re-registro reintroduzca la confianza en JWT sin firma / headers.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(_req: Request, _res: Response, next: NextFunction): void {
    next();
  }
}
