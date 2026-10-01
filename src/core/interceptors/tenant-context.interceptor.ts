import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantLocalStorage } from '../database/tenant.context';

/**
 * Establece el contexto de tenant a partir de la identidad YA VERIFICADA
 * (`req.user` poblado por el guard JWT). Reemplaza al antiguo middleware que
 * derivaba el tenant de un JWT sin firma y de headers no confiables.
 *
 * Corre después de los guards (los interceptores se ejecutan tras los guards),
 * por lo que `req.user` ya pasó por la validación de firma y sesión.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest();
    const user = req?.user;
    const company = user?.company || user?.tenantId;
    const tenant = user?.tenantId || user?.company;

    if (!company && !tenant) {
      return next.handle();
    }

    return tenantLocalStorage.run(
      {
        companyId: company || tenant,
        tenantId: tenant || company,
        isSuperAdmin: user?.isSuperAdmin === true,
      },
      () => next.handle(),
    );
  }
}
