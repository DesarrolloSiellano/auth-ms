import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  message: string;
  statusCode: number;
  status: string;
  data: T;
  meta: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const isRpc = context.getType() === 'rpc';
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const statusCode = response?.statusCode || HttpStatus.OK;

    return next.handle().pipe(
      map((result) => {
        // Si el resultado ya tiene el formato esperado (para compatibilidad mientras refactorizamos)
        if (result && result.status && result.statusCode) {
          // Si es RPC, omitimos el statusCode del objeto que ya viene formateado
          if (isRpc) {
            const { statusCode: _, ...rest } = result;
            return rest as Response<T>;
          }
          return result;
        }

        // Determinamos mensaje, meta y data
        const message = result?.message || 'Operation successful';

        // Si el resultado trae 'meta', lo usamos; si no, generamos uno básico
        const meta =
          result?.meta !== undefined
            ? result.meta
            : { totalData: Array.isArray(result) ? result.length : 1 };

        // REGLA DE ORO PARA COMPATIBILIDAD:
        // Si result.meta existe pero result.data NO, entonces asumimos que el resultado NO debe envolverse en 'data' (formato legacy)
        // De lo contrario, usamos result.data o el resultado mismo como data.
        let data = undefined;
        if (result?.data !== undefined) {
          data = result.data;
        } else if (result?.meta === undefined) {
          data = result;
        }

        return {
          message,
          ...(!isRpc && { statusCode }),
          status: 'Success',
          ...(data !== undefined && { data }),
          meta,
        } as Response<T>;
      }),
    );
  }
}
