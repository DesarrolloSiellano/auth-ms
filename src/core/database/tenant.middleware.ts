import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { tenantLocalStorage } from './tenant.context';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    let companyId: string | undefined;
    let tenantId: string | undefined;
    let isSuperAdmin = false;

    // 1. Intentar obtener el tenant desde el header de Authorization (JWT)
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = this.decodeJwt(token);
      if (payload) {
        companyId = payload.company;
        tenantId = payload.tenantId || payload.company;
        isSuperAdmin = !!payload.isSuperAdmin;
      }
    }

    // 2. Si no viene en JWT (por ejemplo, peticiones entre microservicios sin JWT completo),
    // intentar obtener de headers específicos
    if (!companyId) {
      companyId = req.headers['x-company-id'] as string;
      tenantId = (req.headers['x-tenant-id'] as string) || companyId;
    }

    // 3. Si no hay compañía definida, procedemos (ej. rutas de login, registro, etc.)
    if (!companyId) {
      return next();
    }

    // 4. Ejecutar la petición dentro del contexto asíncrono
    tenantLocalStorage.run(
      {
        tenantId: tenantId || companyId,
        companyId,
        isSuperAdmin,
      },
      () => {
        next();
      },
    );
  }

  /**
   * Helper seguro y rápido para decodificar el payload de un token JWT
   * sin verificar la firma (la firma la valida Passport más adelante).
   */
  private decodeJwt(token: string): any {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payloadBase64 = parts[1];
      const decodedJson = Buffer.from(payloadBase64, 'base64').toString(
        'utf-8',
      );
      return JSON.parse(decodedJson);
    } catch (error) {
      return null;
    }
  }
}
