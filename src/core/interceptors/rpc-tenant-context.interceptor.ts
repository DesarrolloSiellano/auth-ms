import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tenantLocalStorage } from '../database/tenant.context';

/**
 * Establece el contexto de tenant para llamadas TCP (`@MessagePattern`) a
 * partir del tenant que envía la app (payload confiable: la frontera es
 * `serviceKey`). Si el payload no trae tenant, no se establece contexto
 * (compatibilidad con operaciones globales).
 *
 * No se acepta `isSuperAdmin` desde el payload: el alcance global se logra
 * enviando (o no) una empresa explícita.
 */
@Injectable()
export class RpcTenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'rpc') return next.handle();

    const data = context.switchToRpc().getData() || {};
    const user = data.user || {};
    const company = data.company || data.tenantId || user.company || user.tenantId;
    const tenant = data.tenantId || data.company || user.tenantId || user.company;

    if (!company && !tenant) return next.handle();

    return tenantLocalStorage.run(
      {
        companyId: company || tenant,
        tenantId: tenant || company,
        isSuperAdmin: false,
      },
      () => next.handle(),
    );
  }
}
